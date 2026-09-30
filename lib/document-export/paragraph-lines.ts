/**
 * Treat sentence-per-line prose as separate paragraphs in PDF and DOCX.
 * Markdown normally folds a single newline into the same paragraph. Keep
 * explicit Markdown structures and manually wrapped sentences intact.
 */
export function separateProseLines(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let fence: string | null = null;
  let inListOrQuote = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
    }
    if (!trimmed) inListOrQuote = false;
    else if (!fence && /^ {0,3}(?:>|[-*+]\s|\d+[.)]\s)/.test(line)) inListOrQuote = true;

    output.push(line);
    const next = lines[index + 1];
    if (next === undefined || fence || inListOrQuote || !trimmed || !next.trim()) continue;
    if (isStructuredLine(next) || isStructuredLine(line)) continue;
    if (/ {2}$|\\$/.test(line)) continue; // explicit Markdown hard break
    if (/[.!?]["'”’)]?$/.test(trimmed)) output.push("");
  }
  return output.join("\n");
}

function isStructuredLine(line: string): boolean {
  return /^ {4}|^\t|^ {0,3}(?:#{1,6}(?:\s|$)|>|[-*+]\s|\d+[.)]\s|`{3,}|~{3,}|---+\s*$|___+\s*$|\*\*\*+\s*$|<|\||\[\^[^\]]+\]:)/.test(line)
    || /\s\|\s/.test(line);
}
