import { createHash, randomUUID } from "node:crypto";

import type { BibtexEntry } from "../bibtex.ts";
import {
  formatBibliographyEntry,
  formatCitation,
  referenceFromEntry,
  sortCitedReferences,
} from "../citations.ts";
import { replaceMarkdownCitations, splitBibliographyMetadata } from "../markdown-bibliography.ts";
import { bibtexEntryToCslItem } from "./zotero-fields.ts";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function codeSpan(content: string): string {
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map(([run]) => run.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${content}${ticks}{=openxml}`;
}

// Mendeley uses a stable UUID for each item inside a citation control.
function itemId(key: string): string {
  const hex = createHash("sha1").update(`beeblio:mendeley:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function citationControl(key: string, entry: BibtexEntry, cached: string, ordinal: number): string {
  const id = itemId(key);
  const payload = {
    citationID: `MENDELEY_CITATION_${randomUUID()}`,
    properties: { noteIndex: 0 },
    isEdited: false,
    manualOverride: {
      isManuallyOverridden: false,
      citeprocText: xmlEscape(cached),
      manualOverrideText: "",
    },
    citationItems: [{
      id,
      itemData: { ...bibtexEntryToCslItem(entry), id },
      isTemporary: false,
      "suppress-author": false,
      composite: false,
      "author-only": false,
    }],
  };
  const tag = `MENDELEY_CITATION_v3_${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
  return codeSpan(`<w:sdt xmlns:w="${WORD_NS}"><w:sdtPr><w:tag w:val="${tag}"/><w:id w:val="${ordinal}"/></w:sdtPr><w:sdtContent><w:r><w:rPr><w:color w:val="0969DA"/></w:rPr><w:t xml:space="preserve">${xmlEscape(cached)}</w:t></w:r></w:sdtContent></w:sdt>`);
}

function bibliographyControl(entries: string[]): string {
  const paragraphs = entries.map((entry) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(entry)}</w:t></w:r></w:p>`).join("\n");
  const id = Math.floor(Math.random() * 2_147_483_647);
  return `~~~~{=openxml}\n<w:sdt xmlns:w="${WORD_NS}"><w:sdtPr><w:tag w:val="MENDELEY_BIBLIOGRAPHY"/><w:id w:val="${id}"/></w:sdtPr><w:sdtContent>${paragraphs}</w:sdtContent></w:sdt>\n~~~~`;
}

/** Produce Mendeley Cite v3 citation and bibliography content controls for Pandoc. */
export function renderMarkdownWithMendeleyCitations(markdown: string, entries: BibtexEntry[]): string {
  if (entries.length === 0) return markdown;
  const metadata = splitBibliographyMetadata(markdown);
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const references = entries.map(referenceFromEntry);
  const referenceByKey = new Map(references.map((reference) => [reference.id, reference]));
  let ordinal = 0;
  const { markdown: cited, citedIds } = replaceMarkdownCitations(metadata.body, (key, occurrence, mode) => {
    const entry = byKey.get(key);
    if (!entry) return `[@${key}]`;
    const cached = formatCitation(referenceByKey.get(key), metadata.style, occurrence, mode);
    return citationControl(key, entry, cached, ++ordinal);
  });
  const body = cited.trimEnd();
  const ordered = sortCitedReferences(references, metadata.style, citedIds);
  if (ordered.length === 0) return body ? `${body}\n` : "";
  const bibliography = ordered.map((reference) =>
    formatBibliographyEntry(reference, metadata.style, Math.max(1, citedIds.indexOf(reference.id) + 1)));
  return `${body}\n\n## ${metadata.title}\n\n${bibliographyControl(bibliography)}\n`;
}
