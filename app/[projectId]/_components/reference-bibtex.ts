import { replaceBibtexEntry, type BibtexEntry } from "@/lib/bibtex";
import type { ReferenceDraft } from "./reference-sheet";

/**
 * Conversions between a parsed references.bib entry and the ReferenceSheet's
 * editable draft — the single field mapping shared by the bibliography editor
 * and the document editor's citation popover.
 */

export function draftFromBibtexEntry(entry: BibtexEntry): ReferenceDraft {
  const fields = Object.fromEntries(
    Object.entries(entry.fields).map(([name, value]) => [name, value.replaceAll(/\s+/g, " ").trim()]),
  );
  return {
    key: entry.key,
    type: entry.type || "article",
    title: fields.title || "",
    authors: fields.author || "",
    year: fields.year || "",
    date: fields.date || "",
    container: fields.journal || fields.booktitle || "",
    publisher: fields.publisher || "",
    volume: fields.volume || "",
    issue: fields.issue || fields.number || "",
    pages: fields.pages || "",
    doi: fields.doi || "",
    url: fields.url || "",
    abstract: fields.abstract || "",
    keywords: fields.keywords || "",
    note: fields.note || "",
    file: fields.file || "",
    month: fields.month || "",
    editor: fields.editor || "",
    edition: fields.edition || "",
    series: fields.series || "",
    address: fields.address || "",
    school: fields.school || "",
    institution: fields.institution || "",
    organization: fields.organization || "",
    howpublished: fields.howpublished || "",
    urldate: fields.urldate || "",
  };
}

export function updateBibtexSourceWithDraft(source: string, entry: BibtexEntry, draft: ReferenceDraft) {
  const fields = { ...entry.fields };
  setBibtexField(fields, "title", draft.title);
  setBibtexField(fields, "author", draft.authors);
  setBibtexField(fields, "year", draft.year || draft.date.slice(0, 4));
  setBibtexField(fields, "date", draft.date);
  const containerField = fields.journal !== undefined || draft.type.toLowerCase() === "article"
    ? "journal"
    : "booktitle";
  setBibtexField(fields, containerField, draft.container);
  if (!draft.container.trim()) {
    delete fields.journal;
    delete fields.booktitle;
  }
  setBibtexField(fields, "publisher", draft.publisher);
  setBibtexField(fields, "volume", draft.volume);
  setBibtexField(fields, fields.issue !== undefined ? "issue" : "number", draft.issue);
  setBibtexField(fields, "pages", draft.pages);
  setBibtexField(fields, "doi", draft.doi);
  setBibtexField(fields, "url", draft.url);
  setBibtexField(fields, "abstract", draft.abstract);
  setBibtexField(fields, "keywords", draft.keywords);
  setBibtexField(fields, "note", draft.note);
  setBibtexField(fields, "file", draft.file);
  setBibtexField(fields, "month", draft.month);
  setBibtexField(fields, "editor", draft.editor);
  setBibtexField(fields, "edition", draft.edition);
  setBibtexField(fields, "series", draft.series);
  setBibtexField(fields, "address", draft.address);
  setBibtexField(fields, "school", draft.school);
  setBibtexField(fields, "institution", draft.institution);
  setBibtexField(fields, "organization", draft.organization);
  setBibtexField(fields, "howpublished", draft.howpublished);
  setBibtexField(fields, "urldate", draft.urldate);
  return replaceBibtexEntry(source, entry, { type: draft.type, key: draft.key, fields });
}

function setBibtexField(fields: Record<string, string>, name: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) fields[name] = trimmed;
  else delete fields[name];
}
