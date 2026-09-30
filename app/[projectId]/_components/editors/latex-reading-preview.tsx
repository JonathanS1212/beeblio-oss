"use client";

import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

type Block = { kind: "heading"; level: number; value: string } | { kind: "paragraph" | "math" | "abstract" | "code"; value: string } | { kind: "list"; ordered: boolean; items: string[] };
type CitationMap = Map<string, number>;

export function LatexReadingPreview({ source }: { source: string }) {
  const clean = stripComments(source);
  const body = environment(clean, "document") ?? clean;
  const metadata = body.slice(0, Math.max(0, body.indexOf("\\maketitle") >= 0 ? body.indexOf("\\maketitle") : body.length));
  const title = commandArguments(metadata, "title")[0];
  const authors = commandArguments(metadata, "author");
  const protectedBody = protectLiteralEnvironments(body);
  const content = removeEnvironments(removeCommandCalls(protectedBody.source, ["title", "author", "authornote", "authornotemark", "email", "orcid", "affiliation", "institution", "department", "streetaddress", "city", "state", "country", "postcode", "keywords", "ccsdesc", "received"]), ["CCSXML"])
    .replace(/\\(?:maketitle|correspondingauthor)\b/g, "");
  const blocks = parseBlocks(content, protectedBody.literals);
  const citations = citationMap(body);
  return <article className="mx-auto min-h-full max-w-3xl bg-white px-12 py-12 font-serif text-[15px] leading-7 text-neutral-950 shadow-sm">
    {title ? <header className="mb-10 border-b pb-7 text-center"><h1 className="text-3xl font-semibold leading-tight">{renderInline(title, citations)}</h1>{authors.length ? <div className="mt-4 space-y-1 text-sm text-neutral-600">{authors.map((author, index) => <p key={index}>{renderInline(author, citations)}</p>)}</div> : null}</header> : null}
    {blocks.map((block, index) => <LatexBlock key={index} block={block} citations={citations} />)}
  </article>;
}

function LatexBlock({ block, citations }: { block: Block; citations: CitationMap }) {
  if (block.kind === "heading") {
    const className = block.level === 1 ? "mb-3 mt-8 text-2xl font-semibold" : block.level === 2 ? "mb-2 mt-6 text-xl font-semibold" : "mb-2 mt-5 text-lg font-semibold";
    const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
    return <Tag className={className}>{renderInline(block.value, citations)}</Tag>;
  }
  if (block.kind === "abstract") return <section className="mb-7 border-y px-5 py-4"><h2 className="mb-2 text-center text-sm font-semibold uppercase tracking-wider">Abstract</h2><p className="text-justify">{renderInline(block.value, citations)}</p></section>;
  if (block.kind === "list") { const Tag = block.ordered ? "ol" : "ul"; return <Tag className={`mb-5 ml-7 ${block.ordered ? "list-decimal" : "list-disc"}`}>{block.items.map((item, index) => <li key={index} className="pl-1">{renderInline(item, citations)}</li>)}</Tag>; }
  if (block.kind === "math") return <div className="my-5 overflow-x-auto text-center" dangerouslySetInnerHTML={{ __html: renderMath(block.value, true) }} />;
  if (block.kind === "code") return <pre className="mb-5 min-h-10 overflow-x-auto whitespace-pre-wrap rounded border border-neutral-300 bg-neutral-50 p-4 font-mono text-xs leading-5 text-neutral-900"><code>{block.value.replace(/^\n|\n$/g, "")}</code></pre>;
  return <p className="mb-4 text-justify">{renderInline(block.value, citations)}</p>;
}

function parseBlocks(source: string, literals: string[] = []): Block[] {
  const value = restoreLiteralEnvironments(source
    .replace(/\\(?:documentclass|usepackage|newcommand|renewcommand|providecommand|DeclareMathOperator)(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "")
    .replace(/\\(?:label|bibliography|bibliographystyle|pagestyle|thispagestyle)\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:affiliation|authornote|authornotemark|email|orcid|institution|department|streetaddress|city|state|country|postcode|keywords|ccsdesc)(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "")
    .replace(/\\(?:correspondingauthor|balance|flushbottom|raggedbottom)\b/g, ""), literals);
  const blocks: Block[] = [];
  const token = /\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{|\\begin\{(abstract|itemize|enumerate|equation\*?|align\*?|displaymath|math|verbatim\*?|lstlisting|minted)\}(?:\[[^\]]*\])?/g;
  let cursor = 0, match: RegExpExecArray | null;
  while ((match = token.exec(value))) {
    addParagraphs(blocks, value.slice(cursor, match.index));
    if (match[1]) {
      const argument = readGroup(value, token.lastIndex - 1);
      blocks.push({ kind: "heading", level: match[1] === "section" ? 1 : match[1] === "subsection" ? 2 : 3, value: argument.value });
      cursor = argument.end;
    } else {
      const name = match[2], endMarker = `\\end{${name}}`, end = value.indexOf(endMarker, token.lastIndex);
      const content = value.slice(token.lastIndex, end < 0 ? value.length : end);
      if (name === "abstract") blocks.push({ kind: "abstract", value: content.trim() });
      else if (name === "itemize" || name === "enumerate") blocks.push({ kind: "list", ordered: name === "enumerate", items: content.split(/\\item(?:\[[^\]]*\])?\s*/).slice(1).map((item) => item.trim()).filter(Boolean) });
      else if (/^(?:verbatim\*?|lstlisting|minted)$/.test(name)) blocks.push({ kind: "code", value: content });
      else blocks.push({ kind: "math", value: content.trim() });
      cursor = end < 0 ? value.length : end + endMarker.length;
    }
    token.lastIndex = cursor;
  }
  addParagraphs(blocks, value.slice(cursor));
  return blocks;
}

function addParagraphs(blocks: Block[], source: string) {
  source.replace(/\\begin\{(?:figure\*?|table\*?|center)\}[\s\S]*?\\end\{(?:figure\*?|table\*?|center)\}/g, "").split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean).forEach((value) => blocks.push({ kind: "paragraph", value }));
}

function renderInline(source: string, citations: CitationMap): ReactNode[] {
  const normalized = source
    .replace(/\\(?:LaTeX|TeX)\b\s*\\?/g, "LaTeX")
    .replace(/\\BibTeX\b\s*\\?/g, "BibTeX")
    .replace(/``([\s\S]*?)''/g, "“$1”")
    .replace(/`([^'\n]+)'/g, "‘$1’")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/~+/g, " ")
    .replace(/\\(?:cite|citep|citet)\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, (_, keys: string) => `[${keys.split(",").map((key) => citations.get(key.trim()) ?? key.trim()).join(", ")}]`)
    .replace(/\\(?:ref|eqref)\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, "[$1]")
    .replace(/\\\\(?:\[[^\]]*\])?/g, "\u0000")
    .replace(/\s*\n\s*/g, " ");
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\verb\*?\|[^|]*\||\\verb\*?![^!]*!|\\verb\*?\+[^+]*\+|\\verb\*?#[^#]*#|\\url\s*\{[^{}]*\}|\\href\s*\{[^{}]*\}\s*\{[^{}]*\}|\\(?:textbf|textit|emph|texttt|underline)\{[^{}]*\})/g).filter(Boolean);
  return parts.map((part, index) => {
    const math = mathPart(part);
    if (math) return <span key={index} className={math.display ? "my-4 block overflow-x-auto text-center" : "inline"} dangerouslySetInnerHTML={{ __html: renderMath(math.value, math.display) }} />;
    const styled = part.match(/^\\(textbf|textit|emph|texttt|underline)\{([\s\S]*)\}$/);
    if (styled) { const children = renderInline(styled[2], citations); if (styled[1] === "textbf") return <strong key={index}>{children}</strong>; if (styled[1] === "texttt") return <code key={index} className="rounded bg-neutral-100 px-1 font-mono text-[0.9em]">{children}</code>; if (styled[1] === "underline") return <u key={index}>{children}</u>; return <em key={index}>{children}</em>; }
    const url = part.match(/^\\url\s*\{([^{}]*)\}$/);
    if (url) return <a key={index} href={url[1]} target="_blank" rel="noreferrer" className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900">{url[1]}</a>;
    const href = part.match(/^\\href\s*\{([^{}]*)\}\s*\{([^{}]*)\}$/);
    if (href) return <a key={index} href={href[1]} target="_blank" rel="noreferrer" className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900">{renderInline(href[2], citations)}</a>;
    const verb = part.match(/^\\verb\*?(.)([\s\S]*)\1$/);
    if (verb) return <code key={index} className="rounded bg-neutral-100 px-1 font-mono text-[0.9em] text-neutral-800">{verb[2]}</code>;
    const text = plainText(part);
    return <span key={index}>{text.split("\u0000").map((line, lineIndex) => <span key={lineIndex}>{line}{lineIndex < text.split("\u0000").length - 1 ? <br /> : null}</span>)}</span>;
  });
}

function plainText(value: string) { return value.replace(/\{\\o\}/g, "ø").replace(/\{\\O\}/g, "Ø").replace(/\\['`]\{?([A-Za-z])\}?/g, (_, letter: string) => `${letter}\u0301`).replace(/\\\"\{?([A-Za-z])\}?/g, (_, letter: string) => `${letter}\u0308`).replace(/\\(?:itshape|bfseries|normalfont|centering|small|large|Large)\b/g, "").replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?\s*/g, "").replace(/[{}]/g, "").replace(/\\([#$%&_{}])/g, "$1").replace(/[ \t]+/g, " "); }
function mathPart(value: string) { if (value.startsWith("$$") && value.endsWith("$$")) return { value: value.slice(2, -2), display: true }; if (value.startsWith("\\[") && value.endsWith("\\]")) return { value: value.slice(2, -2), display: true }; if (value.startsWith("$") && value.endsWith("$")) return { value: value.slice(1, -1), display: false }; if (value.startsWith("\\(") && value.endsWith("\\)")) return { value: value.slice(2, -2), display: false }; }
function renderMath(value: string, displayMode: boolean) { return katex.renderToString(value, { displayMode, throwOnError: false, strict: false }); }
function stripComments(source: string) { return source.replace(/(^|[^\\])%.*$/gm, "$1"); }
function environment(source: string, name: string) { const start = source.indexOf(`\\begin{${name}}`), end = source.lastIndexOf(`\\end{${name}}`); return start >= 0 && end > start ? source.slice(start + name.length + 8, end) : undefined; }
function commandArguments(source: string, command: string) { const results: string[] = [], expression = new RegExp(`\\\\${command}\\*?(?:\\[[^\\]]*\\])?\\s*\\{`, "g"); while (expression.exec(source)) { const group = readGroup(source, expression.lastIndex - 1); results.push(group.value); expression.lastIndex = group.end; } return results; }
function readGroup(source: string, open: number) { let depth = 0; for (let index = open; index < source.length; index++) { if (source[index] === "{" && source[index - 1] !== "\\") depth++; if (source[index] === "}" && source[index - 1] !== "\\" && --depth === 0) return { value: source.slice(open + 1, index), end: index + 1 }; } return { value: source.slice(open + 1), end: source.length }; }

function removeCommandCalls(source: string, commands: string[]) {
  const expression = new RegExp(`\\\\(?:${commands.join("|")})\\*?(?:\\[[^\\]]*\\])?\\s*\\{`, "g");
  let result = "", cursor = 0, match: RegExpExecArray | null;
  while ((match = expression.exec(source))) { const group = readGroup(source, expression.lastIndex - 1); result += source.slice(cursor, match.index); cursor = group.end; expression.lastIndex = group.end; }
  return result + source.slice(cursor);
}

function removeEnvironments(source: string, names: string[]) {
  return names.reduce((value, name) => value.replace(new RegExp(`\\\\begin\\{${name}\\}[\\s\\S]*?\\\\end\\{${name}\\}`, "g"), ""), source);
}

function protectLiteralEnvironments(source: string) {
  const literals: string[] = [];
  const protectedSource = source.replace(/\\begin\{(verbatim\*?|lstlisting|minted)\}(?:\[[^\]]*\])?[\s\S]*?\\end\{\1\}/g, (literal) => {
    const index = literals.push(literal) - 1;
    return `BEEBLIO_LITERAL_${index}_BLOCK`;
  });
  return { source: protectedSource, literals };
}

function restoreLiteralEnvironments(source: string, literals: string[]) {
  return source.replace(/BEEBLIO_LITERAL_(\d+)_BLOCK/g, (_, index: string) => literals[Number(index)] ?? "");
}

function citationMap(source: string) {
  const citations: CitationMap = new Map();
  const expression = /\\(?:cite|citep|citet)\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g;
  const searchable = protectLiteralEnvironments(source).source;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(searchable))) for (const rawKey of match[1].split(",")) { const key = rawKey.trim(); if (key && !citations.has(key)) citations.set(key, citations.size + 1); }
  return citations;
}
