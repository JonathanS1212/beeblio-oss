import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { beeblioReferenceDocxBase64 } from "./assets/beeblio-reference-docx";
import { integerEnv } from "@/lib/env-config";

const PANDOC = process.env.PANDOC_PATH ?? "pandoc";

const PANDOC_TIMEOUT_MS = integerEnv("PANDOC_TIMEOUT_MS", 120_000, 1_000);
const PANDOC_MAX_BUFFER_BYTES = integerEnv("PANDOC_MAX_BUFFER_BYTES", 256 * 1024 * 1024, 1024 * 1024);

/**
 * Converts markdown to a real, editable A4 DOCX with pandoc. Math ($…$ /
 * $$…$$) becomes native OMML equations; images must already be inlined as
 * data URIs or otherwise reachable by pandoc. Page setup comes from the
 * committed reference template.
 *
 * rawOpenXml enables the reader's raw_attribute extension so the markdown can
 * carry verbatim OpenXML runs (Zotero or Mendeley citation controls). It stays off by
 * default: with it on, `{=openxml}` spans in user-typed markdown would pass
 * into the document unvalidated.
 */
export type ConvertDocxOptions = {
  rawOpenXml?: boolean;
};

export async function convertMarkdownToDocx(
  markdown: string,
  options: ConvertDocxOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = options.rawOpenXml
    ? "gfm+tex_math_dollars+hard_line_breaks+raw_attribute+bracketed_spans"
    : "gfm+tex_math_dollars+hard_line_breaks+bracketed_spans";
  const workDir = await mkdtemp(path.join(tmpdir(), "beeblio-docx-"));
  try {
    const referencePath = path.join(workDir, "reference.docx");
    await writeFile(referencePath, Buffer.from(beeblioReferenceDocxBase64, "base64"));

    const docx = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const child = execFile(
        // Pandoc is resolved from the environment at runtime; the tracer must
        // not try to follow it (it would trace the whole project instead).
        /*turbopackIgnore: true*/ PANDOC,
        [
          `--from=${reader}`,
          "--to=docx",
          `--reference-doc=${referencePath}`,
          "--output=-",
        ],
        { encoding: "buffer", maxBuffer: PANDOC_MAX_BUFFER_BYTES, timeout: PANDOC_TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error) {
            const detail = stderr?.toString().trim();
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              reject(new Error("Pandoc is not installed on the server. Install it with: sudo apt-get install pandoc"));
              return;
            }
            reject(new Error(detail || "Pandoc conversion failed"));
            return;
          }
          // Copy into a plainly-backed buffer: Buffer may sit on a shared or
          // pooled ArrayBufferLike, which BodyInit rejects.
          const bytes = new Uint8Array(stdout.byteLength);
          bytes.set(stdout);
          resolve(bytes);
        },
      );
      child.stdin?.end(markdown, "utf8");
    });
    const zip = await JSZip.loadAsync(docx);
    const stylesFile = zip.file("word/styles.xml");
    if (!stylesFile) return docx;
    const styles = await stylesFile.async("string");
    const colored = styles.replace(/<w:style\b[^>]*w:styleId="Citation"[^>]*>[\s\S]*?<\/w:style>/, (style) => {
      if (/<w:color\b/.test(style)) return style;
      if (/<w:rPr>/.test(style)) return style.replace("<w:rPr>", '<w:rPr><w:color w:val="0969DA"/>');
      return style.replace("</w:style>", '<w:rPr><w:color w:val="0969DA"/></w:rPr></w:style>');
    });
    if (colored === styles) return docx;
    zip.file("word/styles.xml", colored);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    return new Uint8Array(bytes);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
