import type { BibtexEntry } from "../bibtex.ts";
import {
  cleanBibtexText,
  formatBibliographyEntry,
  formatCitation,
  referenceFromEntry,
  sortCitedReferences,
  type CitationStyle,
} from "../citations.ts";
import { replaceMarkdownCitations, splitBibliographyMetadata } from "../markdown-bibliography.ts";

/**
 * Live-citation rendering for the DOCX exporter. Instead of flattening [@key]
 * citations to plain text, each citation is emitted as a Word field whose
 * instruction embeds Zotero's ADDIN payload (CSL-JSON item data), so opening
 * the document with Zotero's Word plugin yields citations that refresh,
 * restyle, and rebuild the bibliography — without the reader owning the
 * references.bib. The field's cached result (what Word shows until then) is
 * the exact text renderMarkdownBibliography would have produced, so the file
 * is visually identical for readers without a reference manager.
 *
 * The fields travel through pandoc as raw OpenXML (`` `<runs>`{=openxml} ``
 * inline, a `~{=openxml}` block for the bibliography), which the DOCX writer
 * passes through verbatim — the caller must enable the raw_attribute reader
 * extension. Payloads are XML-escaped; run sequences are balanced
 * begin/separate/end or Word will reject the document.
 */

const CSL_CITATION_SCHEMA =
  "https://github.com/citation-style-language/schema/raw/master/csl-citation.json";

// Zotero resolves each cited item by URI against the library first; unknown
// URIs fall back to the field's embedded itemData, and that fallback path
// (integration.js loadItemData) indexes surrogate items by uri and crashes
// when citationItems carry no uris at all. The users/local namespace is what
// Zotero itself uses for single-machine libraries, so stable per-key URIs
// there never collide with a reader's real synced items.
const EMBEDDED_ITEM_URI_PREFIX = "http://zotero.org/users/local/beeblio/items/";

function embeddedItemUri(key: string): string {
  return `${EMBEDDED_ITEM_URI_PREFIX}${key}`;
}

const ZOTERO_BIBLIOGRAPHY_INSTRUCTION = '{"uncited":[],"omitted":[],"custom":[]}';

const CSL_TYPES: Record<string, string> = {
  article: "article-journal",
  book: "book",
  conference: "paper-conference",
  inbook: "chapter",
  incollection: "chapter",
  inproceedings: "paper-conference",
  mastersthesis: "thesis",
  phdthesis: "thesis",
  proceedings: "paper-conference",
  techreport: "report",
  manual: "report",
  unpublished: "manuscript",
  dataset: "dataset",
  patent: "patent",
  electronic: "webpage",
  online: "webpage",
  www: "webpage",
};

const CSL_MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

type CslName = { family: string; given?: string } | { literal: string };

export type CslItem = Record<string, unknown>;

export type ZoteroCitationOptions = {
  entries: BibtexEntry[];
  /** Overrides the citation style stored in the document's bibliography marker. */
  style?: CitationStyle;
  /** Overrides the heading stored in the document's bibliography marker. */
  title?: string;
};

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Code span whose delimiters can never collide with backticks in the content. */
function codeSpan(content: string): string {
  let longest = 0;
  let run = 0;
  for (const character of content) {
    run = character === "`" ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${content}${ticks}`;
}

function monthNumber(value: string | undefined): number | undefined {
  const month = cleanBibtexText(value ?? "").toLowerCase().replace(/\.$/, "");
  if (!month) return undefined;
  if (month in CSL_MONTHS) return CSL_MONTHS[month];
  const parsed = Number.parseInt(month, 10);
  return parsed >= 1 && parsed <= 12 ? parsed : undefined;
}

function cslIssued(fields: Record<string, string>): CslItem | undefined {
  const year = cleanBibtexText(fields.year ?? "");
  if (!year) return undefined;
  if (/^\d{4}/.test(year)) {
    const parts = [Number.parseInt(year, 10)];
    const month = monthNumber(fields.month);
    if (month) parts.push(month);
    return { "date-parts": [parts] };
  }
  return { raw: year };
}

function cslNames(entry: BibtexEntry): CslName[] | undefined {
  const author = entry.fields.author;
  if (!author?.trim()) return undefined;

  // A double-braced author value is a single organizational name; keep it
  // literal so CSL renderers print it verbatim instead of inverting it.
  if (/^\{\{[\s\S]*\}\}$/.test((entry.rawFields.author ?? "").trim())) {
    return [{ literal: cleanBibtexText(author) }];
  }

  const names = author
    .split(/\s+and\s+/i)
    .map((part): CslName | undefined => {
      const name = cleanBibtexText(part);
      if (!name) return undefined;
      // BibTeX's "and others" convention; citeproc renders family "others"
      // as "et al."
      if (name.toLowerCase() === "others") return { family: "others" };
      if (name.includes(",")) {
        const [family, ...given] = name.split(",").map((piece) => piece.trim());
        const joined = given.filter(Boolean).join(" ");
        return joined ? { family, given: joined } : { family };
      }
      const tokens = name.split(/\s+/);
      const family = tokens.pop();
      if (!family) return undefined;
      const given = tokens.join(" ");
      return given ? { family, given } : { family };
    })
    .filter((name): name is CslName => Boolean(name));
  return names.length ? names : undefined;
}

/** Maps a parsed BibTeX entry to the CSL-JSON item Zotero fields embed as itemData. */
export function bibtexEntryToCslItem(entry: BibtexEntry): CslItem {
  const fields = entry.fields;
  const text = (value: string | undefined) => cleanBibtexText(value ?? "");
  const item: CslItem = {
    id: entry.key,
    type: CSL_TYPES[entry.type.toLowerCase()] ?? "document",
  };

  const title = text(fields.title);
  if (title) item.title = title;
  const container = text(fields.journal) || text(fields.booktitle);
  if (container) item["container-title"] = container;
  const author = cslNames(entry);
  if (author) item.author = author;
  const issued = cslIssued(fields);
  if (issued) item.issued = issued;
  const volume = text(fields.volume);
  if (volume) item.volume = volume;
  const issue = text(fields.issue) || text(fields.number);
  if (issue) item.issue = issue;
  const pages = text(fields.pages);
  if (pages) item.page = pages.replace(/-{2,}|—/g, "\u2013");
  const publisher = text(fields.publisher) || text(fields.school);
  if (publisher) item.publisher = publisher;
  const doi = text(fields.doi)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "");
  if (doi) item.DOI = doi;
  const url = text(fields.url);
  if (url) item.URL = url;
  return item;
}

function fieldRuns(instruction: string, cached: string, url: string | null = null): string {
  const displayRuns = url
    ? `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r><w:instrText xml:space="preserve"> HYPERLINK "${xmlEscape(url)}" </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0969DA"/></w:rPr><w:t xml:space="preserve">${xmlEscape(cached)}</w:t></w:r>` +
      `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
    : `<w:r><w:rPr><w:color w:val="0969DA"/></w:rPr><w:t xml:space="preserve">${xmlEscape(cached)}</w:t></w:r>`;

  return (
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> ADDIN ${xmlEscape(instruction)} </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    displayRuns +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
  );
}

function citationFieldMarkdown(citationId: string, cached: string, key: string, itemData: CslItem, url: string | null = null): string {
  const payload = JSON.stringify({
    citationID: citationId,
    properties: { formattedCitation: cached, plainCitation: cached, noteIndex: 0 },
    citationItems: [{ id: 0, uris: [embeddedItemUri(key)], itemData }],
    schema: CSL_CITATION_SCHEMA,
  });
  return `${codeSpan(fieldRuns(`ZOTERO_ITEM CSL_CITATION ${payload}`, cached, url))}{=openxml}`;
}

/**
 * Bibliography as one Word field spanning its entry paragraphs: the begin,
 * instruction, and separate runs share the first entry's paragraph and the end
 * run closes the last — mirroring how Zotero lays out multi-paragraph fields.
 */
function bibliographyFieldBlock(entries: string[]): string {
  const instruction = `ZOTERO_BIBL ${ZOTERO_BIBLIOGRAPHY_INSTRUCTION} CSL_BIBLIOGRAPHY`;
  const paragraphs = entries.map((entry, index) => {
    let paragraph = "<w:p>";
    if (index === 0) {
      paragraph +=
        `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
        `<w:r><w:instrText xml:space="preserve"> ADDIN ${xmlEscape(instruction)} </w:instrText></w:r>` +
        `<w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
    }
    paragraph += `<w:r><w:t xml:space="preserve">${xmlEscape(entry)}</w:t></w:r>`;
    if (index === entries.length - 1) {
      paragraph += `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    }
    return `${paragraph}</w:p>`;
  });
  return `~~~~{=openxml}\n${paragraphs.join("\n")}\n~~~~`;
}

/**
 * Live-citation counterpart of renderMarkdownBibliography: resolves [@key]
 * citations against the project bibliography and appends a bibliography
 * heading, but emits each citation and the bibliography as Zotero Word fields
 * (raw OpenXML through pandoc) with the flattened text cached as the field
 * result. Unknown keys keep their raw [@key] spelling and are not listed as
 * missing under the bibliography — a Zotero refresh rebuilds that field from
 * the citation items and would silently drop non-field entries. With no
 * entries or no resolvable citations the output matches the plain renderer's.
 */
export function renderMarkdownWithZoteroCitations(
  markdown: string,
  options: ZoteroCitationOptions,
): string {
  if (options.entries.length === 0) return markdown;

  const metadata = splitBibliographyMetadata(markdown);
  const style = options.style ?? metadata.style;
  const title = (options.title ?? metadata.title).trim() || "References";
  const entryById = new Map(options.entries.map((entry) => [entry.key, entry]));
  const references = options.entries.map(referenceFromEntry);
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  let fieldCount = 0;

  const { markdown: cited, citedIds } = replaceMarkdownCitations(metadata.body, (id, occurrence, mode) => {
    const entry = entryById.get(id);
    if (!entry) return `[@${id}]`;
    const reference = referenceById.get(id);
    const cached = formatCitation(reference, style, occurrence, mode);
    let url = null;
    if (reference) {
      url = reference.doi 
        ? `https://doi.org/${reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")}`
        : reference.url || null;
    }
    return citationFieldMarkdown(`beeblio-${fieldCount++}`, cached, entry.key, bibtexEntryToCslItem(entry), url);
  });

  const documentBody = cited.trimEnd();
  if (citedIds.length === 0 || !citedIds.some((id) => entryById.has(id))) {
    return documentBody ? `${documentBody}\n` : "";
  }

  const ordered = sortCitedReferences(references, style, citedIds);
  const entries = ordered.map((reference) =>
    formatBibliographyEntry(reference, style, Math.max(1, citedIds.indexOf(reference.id) + 1)),
  );

  return `${documentBody}\n\n## ${title}\n\n${bibliographyFieldBlock(entries)}\n`;
}
