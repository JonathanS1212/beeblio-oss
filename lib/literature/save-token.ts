// Shared by the literature and matrix server actions: the search-result item
// schema and the HMAC save tokens that let a client save a search result it
// received without forging one. Lives outside the "use server" action files,
// which may only export async functions.

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { integerEnv } from "@/lib/env-config";
import { LITERATURE_SOURCES } from "@/lib/literature/types";

export const literatureItemSchema = z.object({
  id: z.string().min(1).max(300),
  title: z.string().trim().min(1).max(2_000),
  authors: z.array(z.string().trim().min(1).max(500)).max(200),
  year: z.number().int().min(1500).max(2200).optional(),
  publicationDate: z.string().max(100).optional(),
  venue: z.string().max(1_000).optional(),
  abstract: z.string().max(50_000).optional(),
  keywords: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  doi: z.string().max(500).optional(),
  pmid: z.string().max(100).optional(),
  pmcid: z.string().max(100).optional(),
  url: z.string().url().max(4_000),
  openAccessUrl: z.string().url().max(4_000).optional(),
  pdfUrl: z.string().url().max(4_000).optional(),
  pdfUrls: z.array(z.string().url().max(4_000)).max(30).optional(),
  isOpenAccess: z.boolean(),
  citationCount: z.number().int().nonnegative().optional(),
  sources: z.array(z.enum(LITERATURE_SOURCES)).min(1).max(LITERATURE_SOURCES.length),
  saveToken: z.string().min(1).max(512),
});

export type ValidLiteratureItem = z.infer<typeof literatureItemSchema>;

const RESULT_TOKEN_TTL_MS = integerEnv("LITERATURE_RESULT_TOKEN_TTL_SECONDS", 12 * 60 * 60, 60) * 1_000;

function signingSecret() {
  return process.env.LITERATURE_RESULT_SIGNING_SECRET?.trim() ||
    process.env.EVE_AUTH_SECRET?.trim() ||
    process.env.NEON_AUTH_COOKIE_SECRET?.trim();
}

function signableItem(item: Omit<ValidLiteratureItem, "saveToken">) {
  return {
    id: item.id,
    title: item.title,
    authors: item.authors,
    year: item.year,
    publicationDate: item.publicationDate,
    venue: item.venue,
    abstract: item.abstract,
    keywords: item.keywords,
    doi: item.doi,
    pmid: item.pmid,
    pmcid: item.pmcid,
    url: item.url,
    openAccessUrl: item.openAccessUrl,
    pdfUrl: item.pdfUrl,
    pdfUrls: item.pdfUrls,
    isOpenAccess: item.isOpenAccess,
    citationCount: item.citationCount,
    sources: item.sources,
  };
}

function resultSignature(projectId: string, item: Omit<ValidLiteratureItem, "saveToken">, expiresAt: number) {
  const secret = signingSecret();
  if (!secret) throw new Error("Literature result signing is not configured.");
  return createHmac("sha256", secret)
    .update(JSON.stringify({ projectId, expiresAt, item: signableItem(item) }))
    .digest("base64url");
}

export function createSaveToken(projectId: string, item: Omit<ValidLiteratureItem, "saveToken">) {
  const expiresAt = Date.now() + RESULT_TOKEN_TTL_MS;
  return `${expiresAt}.${resultSignature(projectId, item, expiresAt)}`;
}

export function verifySaveToken(projectId: string, item: ValidLiteratureItem) {
  const separator = item.saveToken.indexOf(".");
  if (separator <= 0) return false;
  const expiresAt = Number(item.saveToken.slice(0, separator));
  const supplied = item.saveToken.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;
  const expected = resultSignature(projectId, signableItem(item), expiresAt);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
