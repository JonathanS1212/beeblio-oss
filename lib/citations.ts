import { parseBibtexEntries, type BibtexEntry } from "./bibtex.ts";

export const CITATION_STYLES = [
  ["apa", "APA 7"],
  ["chicago", "Chicago"],
  ["harvard", "Harvard"],
  ["mla", "MLA 9"],
  ["ieee", "IEEE"],
  ["vancouver", "Vancouver"],
] as const;

export type CitationStyle = (typeof CITATION_STYLES)[number][0];
export type CitationMode = "default" | "narrative";

export type CitationReference = {
  id: string;
  type: string;
  title: string;
  authors: string;
  year: string;
  container: string;
  publisher: string;
  organization?: string;
  howpublished?: string;
  urldate?: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  url: string;
  abstract: string;
  citationCount?: number;
  isOpenAccess: boolean;
};

export function bibliographyReferences(source: string): CitationReference[] {
  return parseBibtexEntries(source).map(referenceFromEntry);
}

export function referenceFromEntry(entry: BibtexEntry): CitationReference {
  // Field names arrive lowercased (the parser normalizes them), so the
  // metrics fields written as citationCount/openAccess read back the same.
  const citationCountText = cleanBibtexText(entry.fields.citationcount);
  const citationCount = citationCountText ? Number.parseInt(citationCountText, 10) : NaN;
  return {
    id: entry.key,
    type: entry.type,
    title: cleanBibtexText(entry.fields.title),
    authors: cleanBibtexText(entry.fields.author),
    year: cleanBibtexText(entry.fields.year || entry.fields.date?.slice(0, 4)),
    container: cleanBibtexText(entry.fields.journal || entry.fields.booktitle),
    publisher: cleanBibtexText(entry.fields.publisher),
    organization: cleanBibtexText(entry.fields.organization),
    howpublished: cleanBibtexText(entry.fields.howpublished),
    urldate: cleanBibtexText(entry.fields.urldate),
    volume: cleanBibtexText(entry.fields.volume),
    issue: cleanBibtexText(entry.fields.issue || entry.fields.number),
    pages: cleanBibtexText(entry.fields.pages).replaceAll("--", "–"),
    doi: cleanBibtexText(entry.fields.doi),
    url: cleanBibtexText(entry.fields.url),
    abstract: cleanBibtexText(entry.fields.abstract),
    citationCount: Number.isFinite(citationCount) && citationCount >= 0 ? citationCount : undefined,
    isOpenAccess: cleanBibtexText(entry.fields.openaccess).toLowerCase() === "true",
  };
}

export function supportsNarrativeCitation(style: CitationStyle) {
  return style === "apa" || style === "chicago" || style === "harvard";
}

export function formatCitation(reference: CitationReference | undefined, style: CitationStyle, number: number, mode: CitationMode = "default") {
  if (!reference) return "(missing reference)";
  if (style === "ieee") return `[${number}]`;
  if (style === "vancouver") return `(${number})`;
  const author = inTextAuthor(reference);
  if (mode === "narrative" && supportsNarrativeCitation(style)) {
    return `${author} (${reference.year || "n.d."})`;
  }
  if (style === "mla") return `(${author})`;
  if (style === "chicago") return `(${author} ${reference.year || "n.d."})`;
  return `(${author}, ${reference.year || "n.d."})`;
}

export function citationKeys(id: string): string[] {
  return id.split(/\s*;\s*@?/).map((key) => key.replace(/^@/, "").trim()).filter(Boolean);
}

export function formatCitationGroup(ids: string[], references: Map<string, CitationReference>, style: CitationStyle, order: string[]): string {
  const parts = ids.map((id) => {
    const reference = references.get(id);
    if (!reference) return `@${id}`;
    return formatCitation(reference, style, Math.max(1, order.indexOf(id) + 1)).replace(/^[([]|[)\]]$/g, "");
  });
  return `${style === "ieee" ? "[" : "("}${parts.join("; ")}${style === "ieee" ? "]" : ")"}`;
}

export function formatBibliographyEntry(reference: CitationReference, style: CitationStyle, number: number) {
  const authors = parseAuthors(reference.authors);
  const author = authors.length ? authors.map((item) => item.familyFirst).join(", ") : reference.organization || "Unknown author";
  const title = reference.title || "Untitled reference";
  const year = reference.year || "n.d.";
  const publication = [reference.container || reference.publisher || (authors.length ? reference.organization : ""), reference.howpublished, reference.volume && `vol. ${reference.volume}`, reference.issue && `no. ${reference.issue}`, reference.pages && `pp. ${reference.pages}`].filter(Boolean).join(", ");
  const link = reference.doi
    ? ` https://doi.org/${reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")}`
    : reference.url ? ` ${reference.url}` : "";

  if (style === "ieee") return `[${number}] ${author}, “${title},”${publication ? ` ${publication},` : ""} ${year}.${link}`;
  if (style === "vancouver") return `${number}. ${author}. ${title}. ${publication ? `${publication}. ` : ""}${year}.${link}`;
  if (style === "mla") return `${author}. “${title}.”${publication ? ` ${publication},` : ""} ${year}.${link}`;
  if (style === "chicago") return `${author}. ${year}. “${title}.”${publication ? ` ${publication}.` : ""}${link}`;
  if (style === "harvard") return `${author} (${year}) ‘${title}’${publication ? `, ${publication}` : ""}.${link}`;
  return `${author} (${year}). ${title}.${publication ? ` ${publication}.` : ""}${link}`;
}

export function sortCitedReferences(references: CitationReference[], style: CitationStyle, citationOrder: string[]) {
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  const cited = citationOrder.map((id) => byId.get(id)).filter((item): item is CitationReference => Boolean(item));
  if (style === "ieee" || style === "vancouver") return cited;
  return [...cited].sort((left, right) => bibliographySortKey(left).localeCompare(bibliographySortKey(right)));
}

function bibliographySortKey(reference: CitationReference) {
  return `${parseAuthors(reference.authors)[0]?.family || ""}\u0000${reference.year}\u0000${reference.title}`;
}

function inTextAuthor(reference: CitationReference) {
  const authors = parseAuthors(reference.authors);
  if (!authors.length) return reference.organization || reference.title || reference.id;
  if (authors.length === 1) return authors[0].family;
  if (authors.length === 2) return `${authors[0].family} & ${authors[1].family}`;
  return `${authors[0].family} et al.`;
}

function parseAuthors(value: string) {
  return value.split(/\s+and\s+/i).map((part) => {
    const name = cleanBibtexText(part);
    const [family, ...given] = name.includes(",") ? name.split(",").map((item) => item.trim()) : [name.split(/\s+/).pop() || name, ...name.split(/\s+/).slice(0, -1)];
    return { family, familyFirst: given.length ? `${family}, ${given.join(" ")}` : family };
  }).filter((author) => author.family);
}

export function cleanBibtexText(value = "") {
  const accents: Record<string, string> = { "'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303", "=": "\u0304", ".": "\u0307", "c": "\u0327", "v": "\u030c" };
  const letters: Record<string, string> = { ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", aa: "å", AA: "Å", o: "ø", O: "Ø", l: "ł", L: "Ł", ss: "ß" };
  return value
    .replace(/\\(['`^"~=.cv])\s*\{?([A-Za-z])\}?/g, (_match, accent: string, letter: string) => `${letter}${accents[accent]}`.normalize("NFC"))
    .replace(/\\(ae|AE|oe|OE|aa|AA|ss|o|O|l|L)(?![A-Za-z])/g, (_match, command: string) => letters[command])
    .replace(/[{}]/g, "")
    .replace(/\\([&%_$#])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
