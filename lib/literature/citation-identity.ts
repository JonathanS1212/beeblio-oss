import { createHash } from "node:crypto";

// Citation identity helpers shared by the literature server actions and the
// matrix actions, so the key computed for a search result always matches the
// key appended to references.bib. Server-only: uses node:crypto.

export type CitationIdentity = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  pmid?: string;
};

function slugPart(value: string, maximum = 60) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximum)
    .replace(/-+$/g, "");
}

export function identitySuffix(item: CitationIdentity) {
  const identity = item.doi || item.pmid || item.id || item.title;
  return createHash("sha256").update(identity).digest("hex").slice(0, 8);
}

export function fileStem(item: CitationIdentity) {
  const firstAuthor = item.authors[0]?.split(/\s+/).at(-1) || "unknown";
  const readable = [slugPart(firstAuthor, 24), item.year || "undated", slugPart(item.title, 54)]
    .filter(Boolean)
    .join("-");
  return `${readable || "reference"}-${identitySuffix(item)}`;
}
