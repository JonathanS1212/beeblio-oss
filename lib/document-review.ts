export const DOCUMENT_REVIEW_PROPOSAL_EVENT = "beeblio:document-review-proposal";
export const DOCUMENT_REVIEW_ACCEPTED_EVENT = "beeblio:document-review-accepted";
export const DOCUMENT_REVIEW_REJECTED_EVENT = "beeblio:document-review-rejected";
export const DOCUMENT_REVIEW_ANCHOR_EVENT = "beeblio:document-review-anchor";

export const REVIEW_TYPES = [
  "claim-confidence",
  "peer-review",
  "source-quality",
  "tone",
  "proofread",
] as const;

export type ReviewType = (typeof REVIEW_TYPES)[number];
export type ReviewSeverity = "info" | "warning" | "critical";

export type ReviewFinding = {
  id: string;
  category: string;
  severity: ReviewSeverity;
  quote: string;
  prefix?: string;
  suffix?: string;
  message: string;
  rationale?: string;
  replacement?: string;
  confidence: number;
  citationKeys?: string[];
  /** Stable coordinates in the immutable Markdown snapshot that was reviewed. */
  from?: number;
  to?: number;
  chunkId?: string;
};

export type DocumentReviewResult = {
  summary: string;
  findings: ReviewFinding[];
  documentHash: string;
  rubricVersion: string;
  reviewedAt: string;
  error?: string;
  errorCode?: "INVALID_REQUEST" | "DOCUMENT_TOO_LARGE" | "NOT_CONFIGURED" | "TIMEOUT" | "GENERATION_FAILED";
  warning?: string;
  reviewedChunks?: number;
  totalChunks?: number;
};

export type DocumentReviewProposalDetail = {
  filePath: string;
  baseContent: string;
  content: string;
  findingIds: string[];
  mode?: "stage" | "commit";
  focus?: { before: string; after: string };
};

export type DocumentReviewAcceptedDetail = {
  filePath: string;
  findingIds: string[];
  content: string;
  mode?: "stage" | "commit";
};

export type DocumentReviewRejectedDetail = {
  filePath: string;
  findingIds: string[];
  mode?: "stage" | "commit";
};

export type DocumentReviewAnchorDetail = {
  filePath: string;
  quote: string;
};

const REVIEW_CITATION_TOKEN = /\[@[A-Za-z0-9_:.-]+\](?:\{(?:font|size|mode)=[^{}\n|]*(?:\|(?:font|size|mode)=[^{}\n|]*)*\})?/g;

export type AppliedReviewFindings = {
  content: string;
  appliedIds: string[];
  citationRejectedIds: string[];
};

/** Apply exact review replacements while treating citation tokens as protected
 * document structure. Review models may rewrite prose, but they may not add,
 * remove, duplicate, or restyle citations as a side effect. */
export function applyReviewFindings(
  content: string,
  findings: readonly ReviewFinding[],
): AppliedReviewFindings {
  let proposed = content;
  const appliedIds: string[] = [];
  const citationRejectedIds: string[] = [];
  let nextHigherRangeStart = content.length;

  const located = findings
    .filter((finding) => finding.replacement)
    .map((finding) => ({ finding, range: locateFinding(content, finding) }))
    .filter((item): item is { finding: ReviewFinding; range: { from: number; to: number } } => item.range !== null)
    .sort((left, right) => right.range.from - left.range.from);

  for (const { finding, range } of located) {
    if (!finding.replacement) continue;
    // Competing findings can address overlapping prose. Keep the later one
    // and skip the overlap rather than splice using invalidated coordinates.
    if (range.to > nextHigherRangeStart) continue;

    const quoteCitations = citationTokens(finding.quote);
    let replacement = finding.replacement;
    const replacementCitations = citationTokens(replacement);

    // The most common model error is adding the already-adjacent citation to a
    // replacement whose quote contained prose only. Remove that hallucinated
    // token while preserving the useful prose edit.
    if (quoteCitations.length === 0 && replacementCitations.length > 0) {
      replacement = replacement
        .replace(REVIEW_CITATION_TOKEN, "")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trimEnd();
    } else if (!sameTokens(quoteCitations, replacementCitations)) {
      citationRejectedIds.push(finding.id);
      continue;
    }

    const candidate = proposed.slice(0, range.from) + replacement + proposed.slice(range.to);
    if (!sameTokens(citationTokens(proposed), citationTokens(candidate))) {
      citationRejectedIds.push(finding.id);
      continue;
    }
    proposed = candidate;
    appliedIds.push(finding.id);
    nextHigherRangeStart = range.from;
  }

  return { content: proposed, appliedIds, citationRejectedIds };
}

/** Re-resolve findings after one proposal has been accepted. This lets a user
 * review changes one at a time without trusting offsets from an older
 * snapshot. Ambiguous findings deliberately lose their coordinates and will
 * remain non-applicable until a fresh review. */
export function reanchorReviewFindings(
  content: string,
  findings: readonly ReviewFinding[],
): ReviewFinding[] {
  return findings.map((finding) => {
    const range = locateFindingByText(content, finding);
    return range
      ? { ...finding, from: range.from, to: range.to }
      : { ...finding, from: undefined, to: undefined };
  });
}

/** Proofreading may change prose, but it must not create Markdown block
 * syntax. In particular, adding `#` to text already inside a heading renders
 * the hashes literally instead of changing the heading level. */
export function preservesProofreadMarkdownStructure(
  content: string,
  finding: ReviewFinding,
): boolean {
  if (!finding.replacement || finding.from === undefined || finding.to === undefined) return true;
  const lineStart = content.lastIndexOf("\n", Math.max(0, finding.from - 1)) + 1;
  const lineEndIndex = content.indexOf("\n", finding.to);
  const lineEnd = lineEndIndex < 0 ? content.length : lineEndIndex;
  const originalLine = content.slice(lineStart, lineEnd);
  const candidateLine = content.slice(lineStart, finding.from) + finding.replacement + content.slice(finding.to, lineEnd);
  const blockPrefix = (line: string) => line.match(/^\s{0,3}(#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+|```+|~~~+)/)?.[1] ?? "";
  if (blockPrefix(originalLine) !== blockPrefix(candidateLine)) return false;

  const beforeQuote = content.slice(lineStart, finding.from);
  if (/^\s{0,3}#{1,6}\s+$/.test(beforeQuote) && /^#{1,6}\s+/.test(finding.replacement)) return false;
  return true;
}

function citationTokens(value: string): string[] {
  return value.match(REVIEW_CITATION_TOKEN) ?? [];
}

function sameTokens(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function locateFinding(content: string, finding: ReviewFinding): { from: number; to: number } | null {
  if (finding.from !== undefined && finding.to !== undefined &&
      finding.from >= 0 && finding.to >= finding.from &&
      content.slice(finding.from, finding.to) === finding.quote) {
    return { from: finding.from, to: finding.to };
  }
  return locateFindingByText(content, finding);
}

function locateFindingByText(content: string, finding: ReviewFinding): { from: number; to: number } | null {
  const matches: number[] = [];
  let from = content.indexOf(finding.quote);
  while (from >= 0) {
    const to = from + finding.quote.length;
    const prefixMatches = !finding.prefix || content.slice(0, from).endsWith(finding.prefix);
    const suffixMatches = !finding.suffix || content.slice(to).startsWith(finding.suffix);
    if (prefixMatches && suffixMatches) matches.push(from);
    from = content.indexOf(finding.quote, from + Math.max(1, finding.quote.length));
  }
  return matches.length === 1
    ? { from: matches[0], to: matches[0] + finding.quote.length }
    : null;
}
