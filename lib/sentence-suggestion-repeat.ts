/** Ignore citation changes when checking whether a continuation repeats itself. */
export function isNearSentenceRepeat(candidate: string, accepted: string): boolean {
  const words = (value: string) => value
    .replace(/\[@[A-Za-z0-9_:.-]+\](?:\{[^}]*\})?/g, " ")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  const candidateWords = words(candidate);
  const acceptedWords = words(accepted);
  if (!candidateWords.length || !acceptedWords.length) return false;
  if (candidateWords.join(" ") === acceptedWords.join(" ")) return true;
  const pairs = (items: string[]) => new Set(items.slice(1).map((word, index) => `${items[index]} ${word}`));
  const left = pairs(candidateWords);
  const right = pairs(acceptedWords);
  if (left.size < 4 || right.size < 4) return false;
  let overlap = 0;
  for (const pair of left) if (right.has(pair)) overlap++;
  return (2 * overlap) / (left.size + right.size) >= 0.78;
}
