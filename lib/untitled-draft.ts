export const UNTITLED_DRAFT_PREFIX = "untitled:";

const INVALID_FILE_NAME = /[<>:"/\\|?*\u0000-\u001F]/;

export type UntitledDraftKind = "markdown" | "excalidraw";

// Suffixes each kind saves as; the first entry is the canonical one. Aliases
// are stripped from user-typed Save As names so "Notes.markdown" and
// "diagram.excalidraw.json" don't double up their extensions.
const KIND_FILE_SUFFIXES: Record<UntitledDraftKind, readonly string[]> = {
  markdown: ["md", "markdown", "mmd", "mermaid"],
  excalidraw: ["excalidraw", "excalidraw.json"],
};

export function isUntitledDraftPath(filePath: string) {
  return filePath.startsWith(UNTITLED_DRAFT_PREFIX);
}

export function untitledDraftKind(filePath: string): UntitledDraftKind {
  return filePath.startsWith(`${UNTITLED_DRAFT_PREFIX}excalidraw:`) ? "excalidraw" : "markdown";
}

export function untitledDraftTabLabel(filePath: string) {
  const suffix = filePath.slice(UNTITLED_DRAFT_PREFIX.length);
  const number = suffix.includes(":") ? suffix.slice(suffix.lastIndexOf(":") + 1) : suffix;
  return `Untitled-${number}`;
}

export function nextUntitledNumber(openPaths: string[], kind: UntitledDraftKind = "markdown") {
  const prefix = kind === "markdown" ? UNTITLED_DRAFT_PREFIX : `${UNTITLED_DRAFT_PREFIX}${kind}:`;
  const used = new Set<number>();
  for (const path of openPaths) {
    if (!path.startsWith(prefix)) continue;
    const value = Number(path.slice(prefix.length));
    if (Number.isInteger(value) && value > 0) used.add(value);
  }
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

export function untitledDraftFile(number: number, kind: UntitledDraftKind = "markdown") {
  const label = `Untitled-${number}`;
  const suffix = kind === "markdown" ? "md" : "excalidraw";
  return {
    name: `${label}.${suffix}`,
    // Markdown keeps its legacy `untitled:N` shape; other kinds carry a kind
    // segment so tabs, drafts, and Save As stay per-kind.
    path: kind === "markdown" ? `${UNTITLED_DRAFT_PREFIX}${number}` : `${UNTITLED_DRAFT_PREFIX}${kind}:${number}`,
  };
}

export function normalizeRootFileName(raw: string, kind: UntitledDraftKind): { name: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Enter a file name." };

  const withForwardSlashes = trimmed.replaceAll("\\", "/");
  if (withForwardSlashes.includes("/")) {
    return { error: "Save this file in the project root. Don't include a folder path." };
  }
  if (INVALID_FILE_NAME.test(trimmed) || trimmed === "." || trimmed === "..") {
    return { error: "That name isn't a valid file name." };
  }

  const suffixes = KIND_FILE_SUFFIXES[kind];
  const suffixPattern = new RegExp(`\\.(${suffixes.join("|")})$`, "i");
  const base = trimmed.replace(suffixPattern, "").trim();
  if (!base) return { error: "Enter a file name." };
  if (INVALID_FILE_NAME.test(base)) return { error: "That name isn't a valid file name." };

  return { name: `${base}.${suffixes[0]}` };
}
