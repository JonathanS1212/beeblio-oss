export type LiteratureMapSource = {
  id: string;
  title?: string;
  authors?: string;
  year?: string;
  container?: string;
  keywords?: string;
  abstract?: string;
  citationCount?: number;
};

export type LiteratureMapEdgeKind = "author" | "keyword" | "similarity" | "venue" | "citation";

export type LiteratureMapEdge = {
  source: string;
  target: string;
  kind: LiteratureMapEdgeKind;
  weight: number;
  reasons: string[];
};

export type LiteratureMapNode = LiteratureMapSource & {
  cluster: number;
  authorsList: string[];
  keywordsList: string[];
};

export type LiteratureMapGraph = {
  nodes: LiteratureMapNode[];
  edges: LiteratureMapEdge[];
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "of", "on", "or", "that", "the", "their", "this", "to", "using", "via", "with",
]);
const MAX_SIMILARITY_NEIGHBORS = 5;

function normalized(value = "") {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value = "") {
  return new Set(normalized(value).split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function list(value = "") {
  return [...new Set(value.split(/\s+and\s+|\s*;\s*|\s*,\s*/i).map(normalized).filter(Boolean))];
}

function authors(value = "") {
  return [...new Set(value.split(/\s+and\s+|\s*;\s*/i).map((name) => {
    const clean = normalized(name.replace(/[{}]/g, ""));
    if (!clean) return "";
    if (name.includes(",")) return normalized(name.split(",")[0]);
    return clean.split(" ").at(-1) || clean;
  }).filter(Boolean))];
}

function intersection<T>(left: Set<T>, right: Set<T>) {
  return [...left].filter((value) => right.has(value));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  const shared = intersection(left, right).length;
  return shared / (left.size + right.size - shared);
}

function pairKey(source: string, target: string) {
  return source < target ? `${source}\u0000${target}` : `${target}\u0000${source}`;
}

/** Builds a deterministic, local-only graph. It never fetches or mutates bibliography data. */
export function buildLiteratureMap(sources: LiteratureMapSource[]): LiteratureMapGraph {
  const prepared = sources.map((source) => ({
    source,
    authors: authors(source.authors),
    keywords: list(source.keywords),
    titleTokens: tokens(source.title),
    abstractTokens: tokens(source.abstract),
    venue: normalized(source.container),
  }));
  const candidates: LiteratureMapEdge[] = [];

  for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < prepared.length; rightIndex += 1) {
      const left = prepared[leftIndex];
      const right = prepared[rightIndex];
      const sharedAuthors = intersection(new Set(left.authors), new Set(right.authors));
      const sharedKeywords = intersection(new Set(left.keywords), new Set(right.keywords));
      const titleSimilarity = jaccard(left.titleTokens, right.titleTokens);
      const abstractSimilarity = jaccard(left.abstractTokens, right.abstractTokens);
      const sameVenue = Boolean(left.venue && left.venue === right.venue);
      const score = Math.min(1,
        Math.min(sharedAuthors.length, 2) * 0.28 +
        Math.min(sharedKeywords.length, 3) * 0.14 +
        titleSimilarity * 0.28 +
        abstractSimilarity * 0.12 +
        (sameVenue ? 0.08 : 0),
      );
      if (score < 0.14) continue;
      const reasons = [
        sharedAuthors.length ? `Shared author: ${sharedAuthors.slice(0, 2).join(", ")}` : "",
        sharedKeywords.length ? `Shared keywords: ${sharedKeywords.slice(0, 3).join(", ")}` : "",
        titleSimilarity >= 0.18 ? "Similar titles" : "",
        abstractSimilarity >= 0.12 ? "Similar abstracts" : "",
        sameVenue ? `Same venue: ${left.source.container}` : "",
      ].filter(Boolean);
      const kind: LiteratureMapEdgeKind = sharedAuthors.length
        ? "author"
        : sharedKeywords.length
          ? "keyword"
          : sameVenue && titleSimilarity < 0.18
            ? "venue"
            : "similarity";
      candidates.push({ source: left.source.id, target: right.source.id, kind, weight: score, reasons });
    }
  }

  // Keep each paper's strongest relationships so dense collections remain legible.
  const allowed = new Set<string>();
  for (const source of sources) {
    candidates
      .filter((edge) => edge.source === source.id || edge.target === source.id)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_SIMILARITY_NEIGHBORS)
      .forEach((edge) => allowed.add(pairKey(edge.source, edge.target)));
  }
  const edges = candidates.filter((edge) => allowed.has(pairKey(edge.source, edge.target)));

  const adjacency = new Map(sources.map((source) => [source.id, new Set<string>()]));
  for (const edge of edges.filter((candidate) => candidate.weight >= 0.2)) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const clusters = new Map<string, number>();
  let cluster = 0;
  for (const source of sources) {
    if (clusters.has(source.id)) continue;
    const queue = [source.id];
    clusters.set(source.id, cluster);
    while (queue.length) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) || []) {
        if (clusters.has(neighbor)) continue;
        clusters.set(neighbor, cluster);
        queue.push(neighbor);
      }
    }
    cluster += 1;
  }

  return {
    nodes: prepared.map(({ source, authors: authorsList, keywords: keywordsList }) => ({
      ...source,
      authorsList,
      keywordsList,
      cluster: clusters.get(source.id) ?? 0,
    })),
    edges,
  };
}
