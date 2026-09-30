import {
  joinBibtexAuthors,
  parseBibtexEntries,
  removeBibtexEntry,
  replaceBibtexEntry,
  splitBibtexAuthors,
  type BibtexEntry,
  type BibtexEntryUpdate,
} from "./bibtex.ts";
import { fileStem, identitySuffix, type CitationIdentity } from "./literature/citation-identity.ts";
import { containerFieldForType, TYPE_SPECIFIC_FIELDS } from "./bibliography-fields.ts";
import { CITATION_TOKEN_REGEX } from "./markdown-bibliography.ts";

// Shared bibliography store: the single source of truth for reading and
// mutating the project's references.bib. Used by the Next.js server actions
// (literature rail, reference forms, imports) and the agent's bibliography
// tools, so entry format, citation keys, and dedupe behave identically no
// matter which side writes. These functions are pure string-in/string-out;
// persistence stays with the workspace file layer.

/** Literature search result fields the bibliography entry is built from. */
export type BibliographyLiteratureItem = CitationIdentity & {
  venue?: string;
  url: string;
  abstract?: string;
  keywords?: string[];
  citationCount?: number;
  isOpenAccess: boolean;
  sources: string[];
};

/** Manually described reference (form/agent input, pre-BibTeX field names). */
export type ManualBibliographyEntry = {
  type: string;
  key?: string;
  title: string;
  authors?: string;
  year?: string;
  date?: string;
  container?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  keywords?: string;
  note?: string;
  file?: string;
  month?: string;
  editor?: string;
  edition?: string;
  series?: string;
  address?: string;
  school?: string;
  institution?: string;
  organization?: string;
  howpublished?: string;
  urldate?: string;
};

/** Compact, model- and UI-friendly view of one bibliography entry. */
export type BibliographyRecord = {
  citationKey: string;
  type: string;
  title: string;
  authors: string;
  year: string | null;
  venue: string | null;
  doi: string | null;
  hasAbstract: boolean;
  hasFile: boolean;
  abstract?: string;
};

function bibValue(value: string, maximum = 20_000) {
  return value
    .replace(/[{}]/g, (character) => character === "{" ? "(" : ")")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

export function serializeLiteratureEntry(
  item: BibliographyLiteratureItem,
  citationKey: string,
  file?: string,
) {
  const fields: [string, string | undefined][] = [
    ["title", item.title],
    ["author", joinBibtexAuthors(item.authors) || undefined],
    ["year", item.year ? String(item.year) : undefined],
    ["journal", item.venue],
    ["doi", item.doi],
    ["pmid", item.pmid],
    ["url", item.url],
    ["abstract", item.abstract],
    ["keywords", item.keywords?.join(", ")],
    ["citationcount", item.citationCount !== undefined ? String(item.citationCount) : undefined],
    ["openaccess", item.isOpenAccess ? "true" : undefined],
    ["note", `Metadata sources: ${item.sources.join(", ")}`],
    ["file", file],
  ];
  const body = fields
    .filter((field): field is [string, string] => Boolean(field[1]))
    .map(([name, value]) => `  ${name} = {${bibValue(value)}},`)
    .join("\n");
  return `@article{${citationKey},\n${body}\n}\n`;
}

export function hasCitationKey(bibliography: string, citationKey: string) {
  const escapedKey = citationKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@[a-z]+\\s*\\{\\s*${escapedKey}\\s*,`, "i").test(bibliography);
}

export function hasCitationIdentity(bibliography: string, suffix: string) {
  return new RegExp(`@[a-z]+\\s*\\{\\s*[^,\\s]*-${suffix}\\s*,`, "i").test(bibliography);
}

// Returns the existing key when the bibliography already holds this item under
// a legacy `-suffix` key, so callers cite the key that actually resolves.
export function findCitationIdentityKey(bibliography: string, suffix: string) {
  const match = new RegExp(`@[a-z]+\\s*\\{\\s*([^,\\s]*-${suffix})\\s*,`, "i").exec(bibliography);
  return match?.[1];
}

export function normalizedDoi(value = "") {
  return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLocaleLowerCase();
}

function manualIdentity(fields: Record<string, string | undefined>) {
  const normalize = (value = "") => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return [normalize(fields.title), normalize(fields.author), normalize(fields.year)].join("|");
}

function normalizedUrl(value?: string) {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

// Resolves the parsed references.bib entry for a search result: exact key
// match first, then legacy entries keyed by the same identity suffix, then
// field-level duplicates (same DOI, or same title/author/year without one) so
// works entered manually are reused instead of duplicated.
export function findCitationEntry(
  bibliography: string,
  item: CitationIdentity,
): BibtexEntry | undefined {
  const stem = fileStem(item).toLocaleLowerCase();
  const suffix = identitySuffix(item);
  const entries = parseBibtexEntries(bibliography);
  return entries.find((entry) => entry.key.toLocaleLowerCase() === stem)
    || entries.find((entry) => entry.key.toLocaleLowerCase().endsWith(`-${suffix}`))
    || findByFieldIdentity(entries, item);
}

function findByFieldIdentity(entries: BibtexEntry[], item: CitationIdentity) {
  const doi = normalizedDoi(item.doi);
  if (doi) return entries.find((entry) => normalizedDoi(entry.fields.doi) === doi);
  const identity = manualIdentity({
    title: item.title,
    author: joinBibtexAuthors(item.authors),
    year: item.year ? String(item.year) : undefined,
  });
  if (identity.startsWith("||")) return undefined;
  return entries.find((entry) =>
    !entry.fields.doi && manualIdentity(entry.fields) === identity);
}

const APPEND_SEPARATOR = (current: string) =>
  current.length > 0 && !current.endsWith("\n\n")
    ? current.endsWith("\n") ? "\n" : "\n\n"
    : "";

/**
 * Appends a literature search result as an `@article` entry, keyed by the
 * canonical `fileStem` key — the same key the UI literature rail saves — and
 * returns the exact key to cite. Reuses an existing entry for the same work
 * (by key, legacy identity suffix, DOI, or title/author/year) instead of
 * duplicating it.
 */
export function appendLiteratureItem(
  source: string,
  item: BibliographyLiteratureItem,
  file?: string,
): { content: string; citationKey: string; alreadyExisted: boolean } {
  const existing = findCitationEntry(source, item);
  if (existing) return { content: source, citationKey: existing.key, alreadyExisted: true };
  const citationKey = fileStem(item);
  return {
    content: `${source}${APPEND_SEPARATOR(source)}${serializeLiteratureEntry(item, citationKey, file)}`,
    citationKey,
    alreadyExisted: false,
  };
}

function cleanBibValue(value = "") {
  return value.replace(/[{}]/g, (character) => character === "{" ? "(" : ")")
    .replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function serializeBibtexEntry(entry: BibtexEntryUpdate) {
  const fields = Object.entries(entry.fields).filter(([, value]) => value.trim());
  return `@${entry.type}{${entry.key},\n${fields.map(([name, value]) => `  ${name} = {${cleanBibValue(value)}},`).join("\n")}\n}`;
}

function slug(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLocaleLowerCase();
}

function uniqueKey(preferred: string, used: Set<string>) {
  const base = slug(preferred).slice(0, 80) || "reference";
  let key = base;
  for (let index = 2; used.has(key.toLocaleLowerCase()); index += 1) key = `${base}-${index}`;
  used.add(key.toLocaleLowerCase());
  return key;
}

// Maps form/agent input onto BibTeX field names, dropping fields the entry
// type does not support (see lib/bibliography-fields.ts).
export function manualEntryToUpdate(
  input: ManualBibliographyEntry,
  used: Set<string>,
): BibtexEntryUpdate {
  const type = input.type.trim();
  const normalizedType = type.toLocaleLowerCase();
  const firstAuthor = input.authors?.split(/\s+and\s+|;/i)[0]?.trim().split(/[\s,]+/).filter(Boolean).at(-1) || "reference";
  const key = uniqueKey(input.key || `${firstAuthor}-${input.year || input.date?.slice(0, 4) || "nd"}-${input.title.split(/\s+/).slice(0, 3).join("-")}`, used);
  const container = containerFieldForType(normalizedType);
  const fields: Record<string, string> = {};
  for (const [name, value] of [
    ["title", input.title], ["author", input.authors], ["year", input.year || input.date?.slice(0, 4)], ["date", input.date],
    [container, input.container],
    ["publisher", input.publisher], ["volume", input.volume], ["number", input.issue],
    ["pages", input.pages], ["doi", input.doi], ["url", input.url],
    ["abstract", input.abstract], ["keywords", input.keywords], ["note", input.note],
    ["file", input.file], ["month", input.month], ["editor", input.editor],
    ["edition", input.edition], ["series", input.series], ["address", input.address],
    ["school", input.school], ["institution", input.institution],
    ["organization", input.organization], ["howpublished", input.howpublished],
    ["urldate", input.urldate],
  ] as Array<[string, string | undefined]>) {
    if (!name || !value?.trim()) continue;
    const allowedTypes = TYPE_SPECIFIC_FIELDS[name];
    if (allowedTypes && !allowedTypes.includes(normalizedType)) continue;
    fields[name] = value.trim();
  }
  return { type, key, fields };
}

/**
 * Appends ready-made BibTeX entries (imports, manual forms), deduplicating by
 * normalized DOI or title/author/year identity and disambiguating keys.
 */
export function appendBibtexUpdates(
  source: string,
  incoming: BibtexEntryUpdate[],
): { content: string; added: Array<{ citationKey: string; alreadyExisted: boolean }>; skipped: number } {
  const existing = parseBibtexEntries(source);
  const used = new Set(existing.map((entry) => entry.key.toLocaleLowerCase()));
  const byDoi = new Map(
    existing
      .map((entry) => [normalizedDoi(entry.fields.doi), entry.key] as const)
      .filter(([doi]) => Boolean(doi)),
  );
  const byUrl = new Map(
    existing
      .filter((entry) => !entry.fields.doi && ["online", "misc"].includes(entry.type.toLowerCase()))
      .map((entry) => [normalizedUrl(entry.fields.url), entry.key] as const)
      .filter(([url]) => Boolean(url)),
  );
  const byIdentity = new Map(
    existing
      .map((entry) => [manualIdentity(entry.fields), entry.key] as const)
      .filter(([identity]) => !identity.startsWith("||")),
  );
  const results: Array<{ citationKey: string; alreadyExisted: boolean }> = [];
  const additions: BibtexEntryUpdate[] = [];
  for (const candidate of incoming) {
    const doi = normalizedDoi(candidate.fields.doi);
    const url = ["online", "misc"].includes(candidate.type.toLowerCase()) ? normalizedUrl(candidate.fields.url) : "";
    const identity = manualIdentity(candidate.fields);
    const duplicateKey = doi ? byDoi.get(doi) : url ? byUrl.get(url) : byIdentity.get(identity);
    if (duplicateKey) {
      results.push({ citationKey: duplicateKey, alreadyExisted: true });
      continue;
    }
    const key = uniqueKey(candidate.key, used);
    const addition = { ...candidate, key };
    additions.push(addition);
    results.push({ citationKey: key, alreadyExisted: false });
    if (doi) byDoi.set(doi, key);
    if (url) byUrl.set(url, key);
    byIdentity.set(identity, key);
  }
  if (!additions.length) return { content: source, added: results, skipped: incoming.length - additions.length };
  const separator = source.trim() ? "\n\n" : "";
  return {
    content: `${source.trimEnd()}${separator}${additions.map(serializeBibtexEntry).join("\n\n")}\n`,
    added: results,
    skipped: incoming.length - additions.length,
  };
}

/** Appends manually described references (agent input, reference forms). */
export function appendManualEntries(
  source: string,
  entries: ManualBibliographyEntry[],
) {
  const used = new Set(parseBibtexEntries(source).map((entry) => entry.key.toLocaleLowerCase()));
  return appendBibtexUpdates(source, entries.map((entry) => manualEntryToUpdate(entry, used)));
}

/**
 * Patches one entry's fields in place, preserving unrelated fields and their
 * order. A whitespace-only patch value removes the field. The citation key
 * and entry type are unchanged.
 */
export function editBibliographyEntry(
  source: string,
  citationKey: string,
  patch: Record<string, string>,
): { content: string; found: boolean } {
  const entry = parseBibtexEntries(source)
    .find((candidate) => candidate.key.toLocaleLowerCase() === citationKey.trim().toLocaleLowerCase());
  if (!entry) return { content: source, found: false };
  const fields: Record<string, string> = { ...entry.fields };
  for (const [rawName, value] of Object.entries(patch)) {
    const name = rawName.trim().toLocaleLowerCase();
    if (!name) continue;
    if (value.trim()) fields[name] = value.trim();
    else delete fields[name];
  }
  return {
    content: replaceBibtexEntry(source, entry, { type: entry.type, key: entry.key, fields }),
    found: true,
  };
}

/** Removes entries by exact citation key (case-insensitive). */
export function removeBibliographyEntries(
  source: string,
  citationKeys: readonly string[],
): { content: string; removed: string[]; notFound: string[] } {
  let content = source;
  const removed: string[] = [];
  const notFound: string[] = [];
  for (const citationKey of citationKeys) {
    const entry = parseBibtexEntries(content)
      .find((candidate) => candidate.key.toLocaleLowerCase() === citationKey.trim().toLocaleLowerCase());
    if (entry) {
      content = removeBibtexEntry(content, entry);
      removed.push(entry.key);
    } else {
      notFound.push(citationKey);
    }
  }
  return { content, removed, notFound };
}

function compactAuthors(value: string | undefined, maximum = 3) {
  const names = splitBibtexAuthors(value ?? "");
  if (!names.length) return "";
  const shown = names.slice(0, maximum).map((name) => name.replace(/\s+/g, " ").trim()).join("; ");
  return names.length > maximum ? `${shown}; et al.` : shown;
}

/**
 * Lists and filters bibliography entries as compact records with the exact
 * citationKey needed for `[@key]` document tokens. A query matches when every
 * whitespace-separated token appears in the entry's key, title, authors,
 * year, venue, publisher, or DOI (case-insensitive).
 */
export function searchBibliographyEntries(
  source: string,
  options: {
    query?: string;
    keys?: readonly string[];
    limit?: number;
    includeAbstract?: boolean;
    abstractLimit?: number;
  } = {},
): { entries: BibliographyRecord[]; totalCount: number; truncated: boolean } {
  const parsed = parseBibtexEntries(source);
  const totalCount = parsed.length;
  const keys = options.keys?.map((key) => key.trim().toLocaleLowerCase()).filter(Boolean) ?? [];
  const tokens = options.query?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const matched = parsed.filter((entry) => {
    if (keys.length) return keys.includes(entry.key.toLocaleLowerCase());
    if (!tokens.length) return true;
    const haystack = [
      entry.key, entry.type,
      entry.fields.title ?? "", entry.fields.author ?? "", entry.fields.year ?? "",
      entry.fields.journal ?? "", entry.fields.booktitle ?? "",
      entry.fields.publisher ?? "", entry.fields.doi ?? "",
    ].join(" ").toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
  const limit = Math.max(1, options.limit ?? 50);
  const truncated = matched.length > limit;
  const abstractLimit = options.abstractLimit ?? 600;
  const entries = matched.slice(0, limit).map((entry) => ({
    citationKey: entry.key,
    type: entry.type.toLocaleLowerCase(),
    title: entry.fields.title ?? "",
    authors: compactAuthors(entry.fields.author),
    year: entry.fields.year ?? null,
    venue: entry.fields.journal || entry.fields.booktitle || null,
    doi: entry.fields.doi || null,
    hasAbstract: Boolean(entry.fields.abstract?.trim()),
    hasFile: Boolean(entry.fields.file?.trim()),
    ...(options.includeAbstract && entry.fields.abstract?.trim()
      ? { abstract: entry.fields.abstract.trim().slice(0, abstractLimit) }
      : {}),
  }));
  return { entries, totalCount, truncated };
}

/** The set of `[@key]` citation keys used anywhere in one markdown document. */
export function citedCitationKeys(markdown: string): Set<string> {
  const keys = new Set<string>();
  for (const match of markdown.matchAll(CITATION_TOKEN_REGEX)) keys.add(match[1]);
  return keys;
}
