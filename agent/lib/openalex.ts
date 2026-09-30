/**
 * Pure URL construction helpers for the OpenAlex /works API, used by the
 * fetch_openalex_works host-side tool. Kept free of network and workspace
 * concerns so the request contract (filters, select fields, encoding) is
 * unit-testable.
 */

export const OPENALEX_WORKS_ENDPOINT = "https://api.openalex.org/works";

/** Full bibliometric record: everything the coding-sheet schema needs. */
export const OPENALEX_FULL_SELECT = [
  "id",
  "doi",
  "title",
  "authorships",
  "publication_year",
  "primary_location",
  "biblio",
  "cited_by_count",
  "keywords",
  "concepts",
  "language",
  "abstract_inverted_index",
  "referenced_works",
] as const;

/** Co-citation / genealogy label resolution only. */
export const OPENALEX_LABEL_SELECT = [
  "id",
  "title",
  "authorships",
  "publication_year",
] as const;

export type OpenAlexSelect = "full" | "labels";

export function openAlexSelectFields(fields: OpenAlexSelect): string {
  return (fields === "labels" ? OPENALEX_LABEL_SELECT : OPENALEX_FULL_SELECT).join(",");
}

export type WorksSearchInput = {
  query: string;
  fromYear?: number;
  toYear?: number;
  requireAbstract?: boolean;
  perPage?: number;
  page?: number;
  fields?: OpenAlexSelect;
  mailto?: string;
};

// Manual encodeURIComponent joining (not URLSearchParams) so spaces stay %20
// and pipes %7C — the forms OpenAlex documents.
function encodeParams(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export function buildWorksSearchUrl(input: WorksSearchInput): string {
  const {
    query,
    fromYear,
    toYear,
    requireAbstract = true,
    perPage = 50,
    page = 1,
    fields = "full",
    mailto,
  } = input;
  const filters = [
    ...(fromYear !== undefined ? [`from_publication_date:${fromYear}-01-01`] : []),
    ...(toYear !== undefined ? [`to_publication_date:${toYear}-12-31`] : []),
    "type:article",
    ...(requireAbstract ? ["has_abstract:true"] : []),
  ];
  return `${OPENALEX_WORKS_ENDPOINT}?${encodeParams({
    search: query,
    filter: filters.join(","),
    select: openAlexSelectFields(fields),
    "per-page": perPage,
    page,
    mailto,
  })}`;
}

/**
 * Accepts `W2741809807`, `openalex:W2741809807`, and
 * `https://openalex.org/W2741809807`; returns the bare ID or null.
 */
export function normalizeWorkId(value: string): string | null {
  const trimmed = value.trim();
  const withoutPrefix = trimmed.startsWith("openalex:")
    ? trimmed.slice("openalex:".length)
    : trimmed;
  const withoutUrl = withoutPrefix.startsWith("https://openalex.org/")
    ? withoutPrefix.slice("https://openalex.org/".length)
    : withoutPrefix;
  return /^W\d{2,20}$/.test(withoutUrl) ? withoutUrl : null;
}

/** Normalize, dedupe, and chunk work IDs for filter=openalex:W1|W2|… calls
 * (OpenAlex documents ≤50 OR values per filter; 25 leaves headroom for
 * long select lists). */
export function chunkWorkIds(values: string[], chunkSize = 25): string[][] {
  const unique = [
    ...new Set(values.map(normalizeWorkId).filter((id): id is string => id !== null)),
  ];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += chunkSize) {
    chunks.push(unique.slice(index, index + chunkSize));
  }
  return chunks;
}

export function buildWorksIdsUrl(
  ids: string[],
  options: { fields?: OpenAlexSelect; mailto?: string } = {},
): string {
  const { fields = "full", mailto } = options;
  return `${OPENALEX_WORKS_ENDPOINT}?${encodeParams({
    filter: `openalex:${ids.join("|")}`,
    select: openAlexSelectFields(fields),
    mailto,
  })}`;
}
