import { parseBibtexEntries } from "./bibtex.ts";

export function normalizeKnowledgeWorkspacePath(value: string) {
  return value.trim().replace(/^\/?workspace\//, "").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function bibliographyAttachmentPaths(value: string) {
  const paths = new Set<string>();
  // Zotero-style BibTeX attachments are usually `path:TYPE`, with multiple
  // attachments separated by semicolons. A final attachment type is removed
  // without disturbing colons inside the path itself.
  for (const attachment of value.split(/\s*;\s*/)) {
    const withoutType = attachment.trim().replace(/:[A-Z][A-Z0-9-]*$/i, "");
    const normalized = normalizeKnowledgeWorkspacePath(withoutType.replace(/^file:\/\//i, ""));
    if (normalized) paths.add(normalized);
  }
  return [...paths];
}

export function bibliographyKeysByFilePathFromSource(source: string) {
  const candidates = new Map<string, Set<string>>();
  for (const entry of parseBibtexEntries(source)) {
    for (const filePath of bibliographyAttachmentPaths(entry.fields.file || "")) {
      const keys = candidates.get(filePath) ?? new Set<string>();
      keys.add(entry.key);
      candidates.set(filePath, keys);
    }
  }
  const result = new Map<string, string>();
  for (const [filePath, keys] of candidates) {
    if (keys.size === 1) result.set(filePath, [...keys][0]);
  }
  return result;
}
