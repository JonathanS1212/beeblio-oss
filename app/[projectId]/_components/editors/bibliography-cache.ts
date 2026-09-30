import { bibliographyReferences, type CitationReference } from "@/lib/citations";

type CachedBibliography = {
  source: string;
  references: CitationReference[];
};

// File preview/editor tabs unmount their editors on switches. Keep the last
// successful bibliography for the lifetime of this page so returning to a
// document can render citations before its background refresh completes.
const entries = new Map<string, CachedBibliography>();

export function readCachedBibliography(projectKey: string): CachedBibliography | undefined {
  return entries.get(projectKey);
}

export function writeCachedBibliography(projectKey: string, source: string): CachedBibliography {
  const existing = entries.get(projectKey);
  if (existing?.source === source) return existing;
  const cached = { source, references: bibliographyReferences(source) };
  entries.set(projectKey, cached);
  return cached;
}

export function clearCachedBibliography(projectKey: string): void {
  entries.delete(projectKey);
}
