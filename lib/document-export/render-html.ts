import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { common, createLowlight } from "lowlight";
import type { Element, Root } from "hast";

import { highlightCss } from "./assets/highlight-css";
import { katexCss } from "./assets/katex-css";
import { printStyles } from "./print-styles";

const lowlight = createLowlight(common);

type Visitor = (node: Element) => void;

/** Minimal depth-first walker so we avoid a direct unist-util-visit dependency. */
function visitElement(node: Root | Element, visit: Visitor): void {
  for (const child of node.children) {
    if (child.type === "element") {
      visit(child);
      visitElement(child, visit);
    }
  }
}

function elementText(node: Element): string {
  const parts: string[] = [];
  const collect = (current: Root | Element) => {
    for (const child of current.children) {
      if (child.type === "text") parts.push(child.value);
      else if (child.type === "element") collect(child);
    }
  };
  collect(node);
  return parts.join("");
}

/** Syntax-highlights <pre><code class="language-x"> blocks with lowlight. */
function rehypeLowlight() {
  return (tree: Root) => {
    visitElement(tree, (node) => {
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      if (!code) return;

      const languageClass = (code.properties?.className ?? []).find(
        (name) => typeof name === "string" && name.startsWith("language-"),
      ) as string | undefined;
      const language = languageClass?.replace("language-", "").toLowerCase() ?? "";
      const source = elementText(code);
      if (!source.trim()) return;

      let highlighted: Root | null = null;
      if (language && lowlight.registered(language)) {
        try {
          highlighted = lowlight.highlight(language, source);
        } catch {
          highlighted = null;
        }
      }

      if (!highlighted) {
        code.properties ??= {};
        code.properties.className = ["hljs"];
        return;
      }

      const highlightedCode = highlighted.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      if (!highlightedCode) return;
      code.children = highlightedCode.children;
      code.properties ??= {};
      code.properties.className = ["hljs", ...(language ? [`language-${language}`] : [])];
    });
  };
}

const CALLOUT_PATTERN = /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*<\/p>/gi;

/** Upgrades GitHub alert markers to styled callout boxes. */
function applyCallouts(html: string): string {
  return html.replace(CALLOUT_PATTERN, (_match, kind: string) => {
    const label = kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
    return `<blockquote class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${label}</p>`;
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeLowlight)
  .use(rehypeStringify, { allowDangerousHtml: true });

/**
 * Renders preprocessed markdown to a self-contained print document: GFM,
 * KaTeX (fonts inlined), lowlight code highlighting, callouts, and the print
 * stylesheet. No external assets, scripts, or network requests.
 */
export async function renderPrintHtml(markdown: string, title: string): Promise<string> {
  const rendered = applyCallouts(String(await processor.process(markdown)));
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${printStyles}</style>`,
    `<style>${highlightCss}</style>`,
    `<style>${katexCss}</style>`,
    "</head>",
    "<body>",
    "<main>",
    rendered,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}
