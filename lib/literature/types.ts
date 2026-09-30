export const LITERATURE_SOURCES = [
  "openalex",
  "crossref",
  "pubmed",
] as const;

export type LiteratureSource = (typeof LITERATURE_SOURCES)[number];
export type LiteratureSourceSelection = "all" | LiteratureSource;

export type LiteratureItem = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  abstract?: string;
  keywords?: string[];
  doi?: string;
  pmid?: string;
  pmcid?: string;
  url: string;
  openAccessUrl?: string;
  pdfUrl?: string;
  pdfUrls?: string[];
  isOpenAccess: boolean;
  citationCount?: number;
  sources: LiteratureSource[];
  saveToken: string;
};

export type LiteratureProviderStatus = {
  source: LiteratureSource;
  ok: boolean;
  resultCount: number;
  hasMore?: boolean;
  message?: string;
};

/** Live scholarly metrics for one DOI, as served by the provider lookup. */
export type LiteratureMetrics = {
  doi: string;
  citationCount?: number;
  isOpenAccess?: boolean;
};

export type LiteratureSearchResponse = {
  items: LiteratureItem[];
  providers: LiteratureProviderStatus[];
  page: number;
  hasMore: boolean;
};

export type SaveLiteratureItemResult = {
  success: boolean;
  citationPath?: string;
  /** The BibTeX key the item is stored under, so callers can cite `[@key]`. */
  citationKey?: string;
  pdfPath?: string;
  alreadyExisted?: boolean;
  error?: string;
};

// Dispatched by the document editor's "@" menu ("More results") so the
// Literature rail opens on its search tab and runs the query there.
export const OPEN_LITERATURE_SEARCH_EVENT = "beeblio:open-literature-search";

export type OpenLiteratureSearchDetail = {
  query: string;
};
