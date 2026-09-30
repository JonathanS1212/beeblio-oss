import {
  formatBibliographyEntry,
  formatCitation,
  sortCitedReferences,
  type CitationReference,
  type CitationMode,
  type CitationStyle,
} from "./citations.ts";

export type BibliographyFont = { family: string; size: string };

export const DEFAULT_BIBLIOGRAPHY_FONT: BibliographyFont = { family: "", size: "" };

/**
 * The generated bibliography is stored in markdown as a trailing heading plus
 * an HTML comment marker carrying the citation style and the section's font
 * family/size (quoted, because families like "Times New Roman" contain
 * spaces). The visual editor splits and re-joins this section on every edit;
 * the document exporters replace it with the rendered entries. Keep this
 * module free of DOM and Node APIs so the editor and the server can share it.
 */
export const BIBLIOGRAPHY_MARKER =
  /\n{2,}(#{1,6})\s+([^\n]+)\n<!-- beeblio:bibliography(?: style=(apa|chicago|harvard|mla|ieee|vancouver))?(?: font="([^"]*)")?(?: size="([^"]*)")? -->\s*$/;

export function splitBibliographyMetadata(markdown: string) {
  const match = BIBLIOGRAPHY_MARKER.exec(markdown);
  if (!match) return { body: markdown, title: "References", style: "apa" as CitationStyle, font: DEFAULT_BIBLIOGRAPHY_FONT };
  return {
    body: markdown.slice(0, match.index),
    title: match[2].trim() || "References",
    style: (match[3] || "apa") as CitationStyle,
    font: { family: match[4] ?? "", size: match[5] ?? "" } satisfies BibliographyFont,
  };
}

export function joinBibliographyMetadata(
  body: string,
  title: string,
  style: CitationStyle,
  hasCitations: boolean,
  font: BibliographyFont = DEFAULT_BIBLIOGRAPHY_FONT,
) {
  const cleanBody = body.trimEnd();
  if (!hasCitations) return cleanBody ? `${cleanBody}\n` : "";
  const fontAttrs = `${font.family ? ` font="${font.family}"` : ""}${font.size ? ` size="${font.size}"` : ""}`;
  return `${cleanBody}${cleanBody ? "\n\n" : ""}## ${title.trim() || "References"}\n<!-- beeblio:bibliography style=${style}${fontAttrs} -->\n`;
}

const FRONTMATTER = /^---[\t ]*\n[\s\S]*?\n---[\t ]*(?:\n|$)/;

/**
 * Removes a leading YAML front matter block, mirroring the editor's
 * frontmatter tokenizer. Exporters call this so document metadata stays out of
 * the printed output: pandoc consumes it for DOCX, but the HTML/PDF path
 * would otherwise print it as body text.
 */
export function stripYamlFrontMatter(markdown: string): string {
  return markdown.replace(FRONTMATTER, "");
}

const FENCE_OPEN = /^\s{0,3}(```+|~~~+)/;
const FENCE_CLOSE = /^\s{0,3}(```+|~~~+)\s*$/;
// The optional {font=…|size=…} suffix carries the citation's visual font
// (set from the editor's font controls); consumers treat it as part of the
// token so it never leaks into rendered output.
const CITATION_PARAMS_SOURCE = String.raw`(?:\{(?:font|size|mode)=[^{}\n|]*(?:\|(?:font|size|mode)=[^{}\n|]*)*\})?`;
export const CITATION_TOKEN_REGEX = new RegExp(String.raw`\[@([A-Za-z0-9_:.-]+)\](` + CITATION_PARAMS_SOURCE + ")", "g");
export const CITATION_TOKEN_SUFFIX_SOURCE = CITATION_PARAMS_SOURCE;
const CITATION = CITATION_TOKEN_REGEX;

export function citationModeFromSuffix(suffix = ""): CitationMode {
  return /(?:^\{|\|)mode=narrative(?:\||\}$)/.test(suffix) ? "narrative" : "default";
}

export type MarkdownBibliographyOptions = {
  references: CitationReference[];
  /** Export-only citation styling; ordinary Markdown stays portable. */
  citationAppearance?: "html" | "docx";
  /** Overrides the citation style stored in the document's bibliography marker. */
  style?: CitationStyle;
  /** Overrides the heading stored in the document's bibliography marker. */
  title?: string;
};

/**
 * Fence-aware walk that hands every [@key] citation outside fenced code to
 * `format`, which returns the replacement text. The formatter receives the
 * key plus its 1-based occurrence number (assigned on first appearance,
 * matching how numeric styles number citations). `citedIds` preserves
 * first-appearance order and includes keys the formatter left unresolved.
 * Content inside fenced code blocks is never touched.
 */
export function replaceMarkdownCitations(
  body: string,
  format: (id: string, occurrence: number, mode: CitationMode) => string,
): { markdown: string; citedIds: string[] } {
  const citedIds: string[] = [];
  const lines: string[] = [];
  let insideFence = false;

  for (const line of body.split("\n")) {
    if (insideFence) {
      lines.push(line);
      if (FENCE_CLOSE.test(line)) insideFence = false;
      continue;
    }
    if (FENCE_OPEN.test(line)) {
      insideFence = true;
      lines.push(line);
      continue;
    }
    lines.push(
      line.includes("[@")
        ? line.replace(CITATION, (_match, id: string, suffix: string) => {
            if (!citedIds.includes(id)) citedIds.push(id);
            return format(id, citedIds.indexOf(id) + 1, citationModeFromSuffix(suffix));
          })
        : line,
    );
  }

  return { markdown: lines.join("\n"), citedIds };
}

/**
 * Resolves [@key] citations against the project bibliography and replaces the
 * trailing bibliography marker with formatted entries, matching what the
 * visual editor renders: style and heading come from the marker (APA by
 * default), numeric styles number by first appearance, and unknown keys keep
 * their raw [@key] spelling and are listed as missing below the bibliography.
 * With no resolvable references the markdown is returned unchanged. Content
 * inside fenced code blocks is never touched.
 */
export function renderMarkdownBibliography(
  markdown: string,
  options: MarkdownBibliographyOptions,
): string {
  if (options.references.length === 0) return markdown;

  const markerMatch = BIBLIOGRAPHY_MARKER.exec(markdown);
  const style = options.style ?? ((markerMatch?.[3] || "apa") as CitationStyle);
  const title = (options.title ?? markerMatch?.[2])?.trim() || "References";
  const body = markerMatch ? markdown.slice(0, markerMatch.index) : markdown;
  const byId = new Map(options.references.map((reference) => [reference.id, reference]));

  const { markdown: cited, citedIds: order } = replaceMarkdownCitations(body, (id, occurrence, mode) => {
    const reference = byId.get(id);
    if (!reference) return `[@${id}]`;
    const text = formatCitation(reference, style, occurrence, mode);
    const url = reference.doi 
      ? `https://doi.org/${reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")}`
      : reference.url || null;
    if (options.citationAppearance === "html") {
      const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      return url
        ? `<a class="beeblio-export-citation" href="${url.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">${escaped}</a>`
        : `<span class="beeblio-export-citation">${escaped}</span>`;
    }
    if (options.citationAppearance === "docx") {
      const label = text.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
      const linked = url ? `[${label}](${url})` : label;
      return `[${linked}]{custom-style="Citation"}`;
    }
    return url ? `[${text}](${url})` : text;
  });

  const documentBody = cited.trimEnd();
  if (order.length === 0) return documentBody ? `${documentBody}\n` : "";

  const ordered = sortCitedReferences(options.references, style, order);
  const knownIds = new Set(ordered.map((reference) => reference.id));
  const entries = ordered.map((reference) =>
    formatBibliographyEntry(reference, style, Math.max(1, order.indexOf(reference.id) + 1)),
  );
  for (const id of order) {
    if (!knownIds.has(id)) entries.push(`Missing reference: @${id}`);
  }

  return `${documentBody}\n\n## ${title}\n\n${entries.join("\n\n")}\n`;
}

/** Converts editor citation tokens to Pandoc's parenthetical/textual syntax. */
export function renderPandocCitations(markdown: string): string {
  let insideFence = false;
  return markdown.split("\n").map((line) => {
    if (insideFence) {
      if (FENCE_CLOSE.test(line)) insideFence = false;
      return line;
    }
    if (FENCE_OPEN.test(line)) {
      insideFence = true;
      return line;
    }
    return line.includes("[@")
      ? line.replace(CITATION_TOKEN_REGEX, (_match, id: string, suffix: string) =>
          citationModeFromSuffix(suffix) === "narrative" ? `@${id}` : `[@${id}]`)
      : line;
  }).join("\n");
}
