import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchLiteratureProviders, type UnsignedLiteratureItem } from "../../lib/literature/search";
import type { LiteratureSource, LiteratureSourceSelection } from "../../lib/literature/types";
import { truncateText } from "../lib/tool-runtime";

type SearchedItem = UnsignedLiteratureItem;

const DATABASES = ["openalex", "crossref", "pubmed"] as const;

const inputSchema = z.object({
  query: z.string().trim().min(2).max(500).describe("The search query for literature."),
  databases: z
    .array(z.enum(["openalex", "crossref", "pubmed"]))
    .min(1)
    .max(3)
    .default([...DATABASES])
    .describe(
      "Which scholarly databases to search: openalex (broad multidisciplinary coverage with abstracts, citation counts, and open-access PDF links), crossref (DOI-registered works from all publishers), pubmed (biomedical and life sciences).",
    ),
  openAccessOnly: z
    .boolean()
    .default(false)
    .describe("Only return open-access works with a retrievable PDF."),
  limit: z.number().int().min(1).max(10).default(5).describe("Max results per database."),
  page: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(1)
    .describe("Result page within each database, for deeper searches."),
});

function itemKey(item: SearchedItem) {
  if (item.doi) return `doi:${item.doi}`;
  if (item.pmid) return `pmid:${item.pmid}`;
  return `title:${item.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;
}

function mergeItem(current: SearchedItem, candidate: SearchedItem): SearchedItem {
  return {
    ...current,
    authors: candidate.authors.length > current.authors.length ? candidate.authors : current.authors,
    year: current.year || candidate.year,
    publicationDate: current.publicationDate || candidate.publicationDate,
    venue: current.venue || candidate.venue,
    abstract: (candidate.abstract?.length || 0) > (current.abstract?.length || 0)
      ? candidate.abstract
      : current.abstract,
    doi: current.doi || candidate.doi,
    pmid: current.pmid || candidate.pmid,
    pmcid: current.pmcid || candidate.pmcid,
    openAccessUrl: current.openAccessUrl || candidate.openAccessUrl,
    pdfUrl: current.pdfUrl || candidate.pdfUrl,
    isOpenAccess: current.isOpenAccess || candidate.isOpenAccess,
    citationCount: Math.max(current.citationCount || 0, candidate.citationCount || 0) || undefined,
    sources: [...new Set([...current.sources, ...candidate.sources])],
  };
}

function mergeItems(items: SearchedItem[]) {
  const merged = new Map<string, SearchedItem>();
  for (const item of items) {
    const key = itemKey(item);
    const existing = merged.get(key);
    merged.set(key, existing ? mergeItem(existing, item) : item);
  }
  return [...merged.values()];
}

function toModelPaper(item: SearchedItem) {
  return {
    id: item.id,
    title: item.title,
    authors: item.authors.slice(0, 20),
    year: item.year ?? null,
    publicationDate: item.publicationDate ?? null,
    venue: item.venue ?? null,
    abstract: item.abstract ? truncateText(item.abstract, 1_500).content : null,
    keywords: item.keywords ?? null,
    doi: item.doi ?? null,
    pmid: item.pmid ?? null,
    url: item.url,
    openAccessUrl: item.openAccessUrl ?? null,
    pdfUrl: item.pdfUrl ?? null,
    isOpenAccess: item.isOpenAccess,
    citationCount: item.citationCount ?? null,
    databases: item.sources,
  };
}

export default defineTool({
  description:
    "Search scholarly literature by keyword across chosen databases: OpenAlex (broad multidisciplinary coverage, abstracts, citation counts, open-access PDF links), Crossref (DOI-registered works from all publishers), and PubMed (biomedical and life sciences). Results from multiple databases are merged and deduplicated; per-database status is reported so a failed database is visible.",
  inputSchema,
  async execute({ query, databases, openAccessOnly, limit, page }) {
    const ordered = DATABASES.filter((database) => databases.includes(database));
    // The shared provider search takes "all" or a single source; a two-database
    // subset runs one call per database and merges here.
    const calls: { source: LiteratureSourceSelection }[] = ordered.length === DATABASES.length
      ? [{ source: "all" }]
      : ordered.map((source: LiteratureSource) => ({ source }));
    const results = await Promise.all(calls.map(({ source }) =>
      searchLiteratureProviders({ query, source, openAccessOnly, perSource: limit, page }),
    ));
    const papers = mergeItems(results.flatMap((result) => result.items)).map(toModelPaper);
    return {
      query,
      databases: ordered,
      providers: results.flatMap((result) => result.providers),
      page,
      hasMore: results.some((result) => result.hasMore),
      papers,
    };
  },
});
