export type DocumentReviewChunk = {
  id: string;
  start: number;
  end: number;
  content: string;
};

export const MAX_REVIEW_DOCUMENT_CHARACTERS = 1_000_000;

/** Split Markdown without normalizing it. Breaks prefer headings and blank
 * lines outside fenced code so returned offsets always address the original
 * editor snapshot. */
export function chunkDocumentForReview(
  markdown: string,
  targetCharacters = 20_000,
  maximumCharacters = 28_000,
): DocumentReviewChunk[] {
  if (!markdown) return [];
  if (markdown.length <= maximumCharacters) {
    return [{ id: "chunk-1", start: 0, end: markdown.length, content: markdown }];
  }

  const preferred: number[] = [];
  const acceptable: number[] = [];
  let fenced = false;
  let cursor = 0;
  for (const line of markdown.split(/(?<=\n)/)) {
    const trimmed = line.trimStart();
    if (/^(?:```|~~~)/.test(trimmed)) fenced = !fenced;
    cursor += line.length;
    if (fenced) continue;
    if (/^#{1,6}\s/.test(trimmed)) preferred.push(cursor - line.length);
    if (line.trim() === "") acceptable.push(cursor);
  }

  const chunks: DocumentReviewChunk[] = [];
  let start = 0;
  while (start < markdown.length) {
    const hardEnd = Math.min(markdown.length, start + maximumCharacters);
    if (hardEnd === markdown.length) {
      chunks.push(makeChunk(chunks.length, start, hardEnd, markdown));
      break;
    }
    const target = start + targetCharacters;
    const end = bestBreak(preferred, start, target, hardEnd)
      ?? bestBreak(acceptable, start, target, hardEnd)
      ?? markdown.lastIndexOf("\n", hardEnd)
      ?? hardEnd;
    const safeEnd = end > start ? end : hardEnd;
    chunks.push(makeChunk(chunks.length, start, safeEnd, markdown));
    start = safeEnd;
  }
  return chunks;
}

function bestBreak(points: readonly number[], start: number, target: number, hardEnd: number) {
  let best: number | undefined;
  for (const point of points) {
    if (point <= start || point > hardEnd) continue;
    if (point >= target) return point;
    best = point;
  }
  return best;
}

function makeChunk(index: number, start: number, end: number, markdown: string): DocumentReviewChunk {
  return { id: `chunk-${index + 1}`, start, end, content: markdown.slice(start, end) };
}
