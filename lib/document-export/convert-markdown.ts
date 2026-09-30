import JSZip from "jszip";

import type { ImageLoader } from "./markdown-preprocess.ts";
import { CITATION_TOKEN_REGEX } from "../markdown-bibliography.ts";

const FENCE_OPEN = /^\s{0,3}(```+|~~~+)/;
const FENCE_CLOSE = /^\s{0,3}(```+|~~~+)\s*$/;
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s<>]+)>?(?:\s+"([^"]*)")?\s*\)/g;
const DATA_URI = /^data:([^;,]+);base64,([\s\S]+)$/;
// [\s\S] instead of . lets blocks containing hard line breaks (a styled span
// or aligned paragraph across a Shift+Enter) match across lines.
const ALIGNED_PARAGRAPH = /<p\s+style="[^"]*">([\s\S]+?)<\/p>/g;
const ALIGNED_HEADING = /<(h[1-6])\s+style="[^"]*">([\s\S]+?)<\/\1>/g;
// Innermost span only: the guarded dot refuses nested <span/</span, so one
// replace per nesting level unwraps styled runs without losing inner text.
const INNERMOST_SPAN = /<span\b[^>]*>((?:(?!<span\b|<\/span\b)[\s\S])*?)<\/span>/g;
const BIBLIOGRAPHY_COMMENT = /<!-- beeblio:bibliography([^>]*)-->/g;
const MAX_SPAN_UNWRAP_ROUNDS = 10;

// Formats every markdown renderer displays natively; anything else the image
// loader produces is left on its original reference rather than bundled in a
// format half the previewers would not show.
const MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
};

export type PortableMarkdown = {
  /** Sanitized markdown with resolvable image references rewritten to media/… */
  markdown: string;
  /** Zip of {stem}.md + media/ when any image resolved; null when the plain single .md is the whole export. */
  bundle: Uint8Array<ArrayBuffer> | null;
};

export type PortableMarkdownOptions = {
  /** Markdown with citations and the bibliography already flattened to text. */
  markdown: string;
  /** Document stem used for the .md file inside the bundle. */
  stem: string;
  /** Resolves markdown image sources to data URIs (workspace files, remote URLs). */
  loadImage: ImageLoader;
};

/**
 * Converts the editor's round-trip markdown into a portable download:
 * presentation markup the editor emits for WYSIWYG fidelity (styled spans,
 * aligned <p>/<hN>, citation font params, bibliography font attributes) is
 * unwrapped back to plain markdown, and every resolvable image reference is
 * staged under media/ next to the document. Unresolvable images keep their
 * original reference. Fenced code — including ```mermaid blocks, which GitHub
 * and VS Code render natively — passes through untouched.
 */
export async function convertMarkdownToPortableBundle(
  options: PortableMarkdownOptions,
): Promise<PortableMarkdown> {
  const media = new Map<string, Buffer>();
  const mediaBySource = new Map<string, string | null>();
  const usedNames = new Set<string>();
  const lines = options.markdown.split("\n");
  const output: string[] = [];
  let segment: string[] = [];
  let fenceMarker: string | null = null;

  const stageImage = async (source: string): Promise<string | null> => {
    let loaded = null;
    try {
      loaded = await options.loadImage(source);
    } catch {
      loaded = null;
    }
    const match = loaded ? DATA_URI.exec(loaded.dataUri) : null;
    if (!match) return null;
    const [, mime, base64] = match;
    const name = mediaNameFor(source, mime, usedNames);
    if (!name) return null;
    media.set(name, Buffer.from(base64, "base64"));
    return name;
  };

  const rewriteImages = async (line: string): Promise<string> => {
    if (!line.includes("![")) return line;
    for (const match of line.matchAll(IMAGE)) {
      const source = match[2];
      if (mediaBySource.has(source)) continue;
      mediaBySource.set(source, await stageImage(source));
    }
    return line.replace(IMAGE, (match, alt: string, source: string, title: string) => {
      const name = mediaBySource.get(source) ?? null;
      if (!name) return match;
      const titlePart = typeof title === "string" && title ? ` "${title.replaceAll('"', '\\"')}"` : "";
      return `![${alt}](media/${name}${titlePart})`;
    });
  };

  // Sanitization runs per fence-free segment (not per line) so styled spans
  // and aligned blocks that contain hard line breaks still unwrap whole.
  // Image references never span lines, so they are rewritten line by line
  // after the segment is sanitized. The tiptap serializer escapes < in user
  // text, so every real tag in a fence-free segment is editor-emitted markup.
  const flushSegment = async () => {
    if (segment.length === 0) return;
    const sanitized = sanitizeMarkdownSegment(segment.join("\n"));
    segment = [];
    for (const sanitizedLine of sanitized.split("\n")) {
      output.push(await rewriteImages(sanitizedLine));
    }
  };

  for (const line of lines) {
    if (fenceMarker) {
      output.push(line);
      if (FENCE_CLOSE.test(line)) fenceMarker = null;
      continue;
    }
    const fenceOpen = line.match(FENCE_OPEN);
    if (fenceOpen) {
      await flushSegment();
      fenceMarker = fenceOpen[1].slice(0, 1).repeat(3);
      output.push(line);
      continue;
    }
    segment.push(line);
  }
  await flushSegment();

  const markdown = output.join("\n");
  if (media.size === 0) return { markdown, bundle: null };

  const zip = new JSZip();
  zip.file(`${options.stem}.md`, markdown);
  const folder = zip.folder("media");
  for (const [name, bytes] of media) folder?.file(name, bytes);
  const generated = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  // Copy into a plainly-backed buffer: generated buffers may sit on a shared
  // or pooled ArrayBufferLike, which BodyInit rejects.
  const bundle = new Uint8Array(generated.byteLength);
  bundle.set(generated);
  return { markdown, bundle };
}

/**
 * Strips the editor's presentation-only markup from a fence-free markdown
 * segment: styled spans unwrap to their text, alignment-only <p>/<hN> revert
 * to plain markdown blocks, citation {font=…|size=…} suffixes and
 * bibliography font attributes drop off (markdown has no font syntax, and
 * most sanitizing previewers discard inline style attributes anyway). Content
 * that already is portable — <sub>/<sup>, diff <ins>/<del>, links, math — is
 * left alone.
 */
function sanitizeMarkdownSegment(segment: string): string {
  let sanitized = segment
    .replace(ALIGNED_HEADING, (_match, tag: string, inner: string) => `${"#".repeat(Number(tag[1]))} ${inner}`)
    .replace(ALIGNED_PARAGRAPH, (_match, inner: string) => inner);

  for (let round = 0; round < MAX_SPAN_UNWRAP_ROUNDS; round += 1) {
    const unwrapped = sanitized.replace(INNERMOST_SPAN, (_match, inner: string) => inner);
    if (unwrapped === sanitized) break;
    sanitized = unwrapped;
  }

  if (sanitized.includes("<!-- beeblio:bibliography")) {
    sanitized = sanitized.replace(BIBLIOGRAPHY_COMMENT, (_match, attrs: string) => {
      const cleaned = attrs.replace(/\s+(?:font|size)="[^"]*"/g, "");
      return `<!-- beeblio:bibliography${cleaned}-->`;
    });
  }

  return sanitized.includes("[@") ? stripCitationFontParams(sanitized) : sanitized;
}

function stripCitationFontParams(line: string): string {
  return line.replace(CITATION_TOKEN_REGEX, (_match, id: string) => `[@${id}]`);
}

/**
 * Derives a unique media/ file name for an image source: the original base
 * name when it already carries a renderable image extension, otherwise the
 * base name plus the extension the loaded bytes actually are. Collisions from
 * distinct sources get -2, -3, … suffixes; the same source reuses its name.
 */
function mediaNameFor(source: string, mime: string, usedNames: Set<string>): string | null {
  const extension = MEDIA_MIME_EXTENSIONS[mime];
  if (!extension) return null;

  const withoutSuffix = source.split(/[?#]/, 1)[0];
  const rawName = withoutSuffix.replaceAll("\\", "/").split("/").pop() ?? "";
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {}

  const hasImageExtension = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(decoded);
  const stem = (hasImageExtension ? decoded.slice(0, decoded.lastIndexOf(".")) : decoded)
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/^[. ]+|[. ]+$/g, "");
  const finalExtension = hasImageExtension ? decoded.slice(decoded.lastIndexOf(".")).toLowerCase() : extension;

  let name = `${stem || "image"}${finalExtension}`;
  let counter = 2;
  while (usedNames.has(name)) {
    name = `${stem || "image"}-${counter}${finalExtension}`;
    counter += 1;
  }
  usedNames.add(name);
  return name;
}
