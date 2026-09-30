"use server";

import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { integerEnv } from "@/lib/env-config";
import { replaceBibtexEntry } from "@/lib/bibtex";
import {
  appendLiteratureItem,
  findCitationEntry,
  hasCitationIdentity,
  hasCitationKey,
} from "@/lib/bibliography-store";
import { fileStem, identitySuffix } from "@/lib/literature/citation-identity";
import {
  PROJECT_BIBLIOGRAPHY_NAME,
  REFERENCES_DIRECTORY,
} from "@/lib/project-bibliography";
import {
  createSaveToken,
  literatureItemSchema,
  verifySaveToken,
} from "@/lib/literature/save-token";
import { lookupLiteratureMetrics, searchLiteratureProviders } from "@/lib/literature/search";
import { LITERATURE_SOURCES } from "@/lib/literature/types";
import {
  AgentWorkspaceError,
  createAgentWorkspaceDirectory,
  listAgentWorkspaceFiles,
  readAgentWorkspaceFile,
  readAgentWorkspaceTextOrNull,
  writeAgentWorkspaceFile,
} from "@/lib/workspace-files";
import { getOwnedProject } from "./actions";

const searchInputSchema = z.object({
  projectId: z.string().regex(/^[A-Za-z0-9_-]+$/),
  query: z.string().trim().min(2).max(300),
  source: z.union([z.literal("all"), z.enum(LITERATURE_SOURCES)]),
  openAccessOnly: z.boolean(),
  page: z.number().int().min(1).max(50).default(1),
});

const saveInputSchema = z.object({
  projectId: z.string().regex(/^[A-Za-z0-9_-]+$/),
  item: literatureItemSchema,
});

const literatureIdentitySchema = literatureItemSchema.pick({
  id: true,
  title: true,
  authors: true,
  year: true,
  doi: true,
  pmid: true,
});

const savedStateInputSchema = z.object({
  projectId: z.string().regex(/^[A-Za-z0-9_-]+$/),
  items: z.array(literatureIdentitySchema).max(1_500),
});

const metricsInputSchema = z.object({
  projectId: z.string().regex(/^[A-Za-z0-9_-]+$/),
  dois: z.array(z.string().trim().min(4).max(500)).min(1).max(10),
});


const LITERATURE_PDF_MAX_REDIRECTS = integerEnv("LITERATURE_PDF_MAX_REDIRECTS", 5, 0);
const LITERATURE_PDF_TIMEOUT_MS = integerEnv("LITERATURE_PDF_TIMEOUT_MS", 30_000, 1_000);
const LITERATURE_PER_SOURCE_RESULTS = integerEnv("LITERATURE_PER_SOURCE_RESULTS", 8, 1);
const DEFAULT_MAX_PDF_BYTES = 50_000_000;

async function requireOwnedProject(projectId: string) {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectId);
  if (!project) throw new Error("Project not found.");
  return user;
}

export async function searchLiterature(input: unknown) {
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Enter a search query between 2 and 300 characters.");
  const { projectId, query, source, openAccessOnly, page } = parsed.data;
  await requireOwnedProject(projectId);
  const result = await searchLiteratureProviders({
    query,
    source,
    openAccessOnly,
    perSource: LITERATURE_PER_SOURCE_RESULTS,
    page,
  });
  return {
    providers: result.providers,
    page: result.page,
    hasMore: result.hasMore,
    items: result.items.map((item) => ({
      ...item,
      saveToken: createSaveToken(projectId, item),
    })),
  };
}

// Live citation count / open-access status for citations already in
// references.bib, looked up by DOI (e.g. for the citation details popover).
export async function fetchLiteratureMetrics(input: unknown) {
  const parsed = metricsInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("The literature metrics request is invalid.");
  const { projectId, dois } = parsed.data;
  await requireOwnedProject(projectId);
  return lookupLiteratureMetrics(dois);
}

export async function getLiteratureSavedState(input: unknown) {
  const parsed = savedStateInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("The literature results are invalid.");
  const { projectId, items } = parsed.data;
  const user = await requireOwnedProject(projectId);

  let existing;
  try {
    existing = await listAgentWorkspaceFiles(user.id, projectId, REFERENCES_DIRECTORY);
  } catch (error) {
    if (error instanceof AgentWorkspaceError && error.status === 404) {
      return { citationIds: [] as string[], pdfPaths: {} as Record<string, string> };
    }
    throw error;
  }

  const names = new Set(existing.map((entry) => entry.name));
  const bibliographyPath = path.posix.join(REFERENCES_DIRECTORY, PROJECT_BIBLIOGRAPHY_NAME);
  const bibliography = names.has(PROJECT_BIBLIOGRAPHY_NAME)
    ? await (await readAgentWorkspaceFile(user.id, projectId, bibliographyPath)).text()
    : "";
  const citationIds: string[] = [];
  const pdfPaths: Record<string, string> = {};
  for (const item of items) {
    const stem = fileStem(item);
    const suffix = identitySuffix(item);
    const legacyCitation = existing.find((entry) => entry.name.endsWith(`-${suffix}.bib`));
    if (hasCitationKey(bibliography, stem) || hasCitationIdentity(bibliography, suffix) || legacyCitation) {
      citationIds.push(item.id);
    }
    const pdf = existing.find((entry) => entry.name.endsWith(`-${suffix}.pdf`));
    if (pdf) pdfPaths[item.id] = path.posix.join(REFERENCES_DIRECTORY, pdf.name);
  }
  return { citationIds, pdfPaths };
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || a >= 224;
}

function isPrivateIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;
  const normalized = address.toLocaleLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
}

async function assertPublicPdfUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("The open-access download URL is not a safe HTTPS address.");
  }
  const hostname = url.hostname.toLocaleLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("The open-access download URL points to a local address.");
  }
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("The open-access download URL points to a private address.");
  }
  return url;
}

async function downloadPdf(value: string) {
  const configuredLimit = Number(process.env.MAX_LITERATURE_PDF_BYTES || DEFAULT_MAX_PDF_BYTES);
  const maximumBytes = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_MAX_PDF_BYTES;
  let url = await assertPublicPdfUrl(value);
  for (let redirects = 0; redirects <= LITERATURE_PDF_MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, {
      headers: {
        accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
        referer: `${url.origin}/`,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(LITERATURE_PDF_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === LITERATURE_PDF_MAX_REDIRECTS) throw new Error("The paper download redirected too many times.");
      url = await assertPublicPdfUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
        throw new Error("The paper host requires an interactive browser challenge.");
      }
      throw new Error(`The paper host returned HTTP ${response.status}.`);
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      throw new Error("The paper exceeds the configured PDF size limit.");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maximumBytes) throw new Error("The paper exceeds the configured PDF size limit.");
    const pdfHeaderOffset = buffer.subarray(0, 1_024).indexOf("%PDF-");
    if (pdfHeaderOffset < 0) {
      throw new Error("The open-access link did not return a PDF file.");
    }
    return buffer;
  }
  throw new Error("The paper could not be downloaded.");
}

export async function saveLiteratureCitation(input: unknown) {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "The literature item is invalid." };
  const { projectId, item } = parsed.data;
  const user = await requireOwnedProject(projectId);
  if (!verifySaveToken(projectId, item)) {
    return { success: false as const, error: "This search result expired. Run the search again before saving." };
  }

  try {
    const citationPath = path.posix.join(REFERENCES_DIRECTORY, PROJECT_BIBLIOGRAPHY_NAME);
    // A 404 on the read answers existence; the directory listing and the
    // unconditional directory placeholder it replaced said nothing the bib
    // content doesn't.
    const existingBibliography = await readAgentWorkspaceTextOrNull(user.id, projectId, citationPath);
    const currentBibliography = existingBibliography ?? "";
    const result = appendLiteratureItem(currentBibliography, item);
    if (!result.alreadyExisted) {
      if (existingBibliography === null) {
        await createAgentWorkspaceDirectory(user.id, projectId, REFERENCES_DIRECTORY);
      }
      await writeAgentWorkspaceFile(user.id, projectId, citationPath, result.content);
    }
    revalidatePath(`/${projectId}`);
    return {
      success: true as const,
      citationPath,
      citationKey: result.citationKey,
      alreadyExisted: result.alreadyExisted,
      bibliographyContent: result.content,
    };
  } catch (error) {
    console.error("[literature-citation-save] failed", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "The citation could not be saved.",
    };
  }
}

export async function saveLiteraturePdf(input: unknown) {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "The literature item is invalid." };
  const { projectId, item } = parsed.data;
  const user = await requireOwnedProject(projectId);
  if (!verifySaveToken(projectId, item)) {
    return { success: false as const, error: "This search result expired. Run the search again before saving." };
  }
  const pdfUrls = [...new Set([...(item.pdfUrls || []), ...(item.pdfUrl ? [item.pdfUrl] : [])])];
  if (pdfUrls.length === 0) {
    return { success: false as const, error: "This result does not include a direct open-access PDF." };
  }

  try {
    await createAgentWorkspaceDirectory(user.id, projectId, REFERENCES_DIRECTORY);
    const existing = await listAgentWorkspaceFiles(user.id, projectId, REFERENCES_DIRECTORY);
    const stem = fileStem(item);
    const pdfName = `${stem}.pdf`;
    const existingPdf = existing.find((entry) => entry.name.endsWith(`-${identitySuffix(item)}.pdf`));
    const pdfPath = path.posix.join(REFERENCES_DIRECTORY, existingPdf?.name || pdfName);
    const alreadyExisted = Boolean(existingPdf);
    if (!alreadyExisted) {
      let downloadedPdf: Buffer | undefined;
      let lastError: unknown;
      for (const pdfUrl of pdfUrls) {
        try {
          downloadedPdf = await downloadPdf(pdfUrl);
          break;
        } catch (error) {
          lastError = error;
          console.warn(
            "[literature-pdf-save] candidate failed",
            new URL(pdfUrl).hostname,
            error instanceof Error ? error.message : error,
          );
        }
      }
      if (!downloadedPdf) {
        throw lastError instanceof Error
          ? new Error(`None of the available open-access PDF locations could be downloaded. ${lastError.message}`)
          : new Error("None of the available open-access PDF locations could be downloaded.");
      }
      await writeAgentWorkspaceFile(user.id, projectId, pdfPath, Uint8Array.from(downloadedPdf));
    }

    // Saving the PDF also keeps references.bib in sync: the citation entry is
    // appended when missing, and its Linked File field always points at the
    // stored PDF — including entries saved earlier without a PDF.
    const citationPath = path.posix.join(REFERENCES_DIRECTORY, PROJECT_BIBLIOGRAPHY_NAME);
    const currentBibliography = existing.some((entry) => entry.name === PROJECT_BIBLIOGRAPHY_NAME)
      ? await (await readAgentWorkspaceFile(user.id, projectId, citationPath)).text()
      : "";
    const fileField = `${pdfPath}:PDF`;
    const citationEntry = findCitationEntry(currentBibliography, item);
    let citationAdded = false;
    let citationLinked = false;
    let bibliographyContent = currentBibliography;
    if (!citationEntry) {
      const result = appendLiteratureItem(currentBibliography, item, fileField);
      bibliographyContent = result.content;
      if (!result.alreadyExisted) {
        await writeAgentWorkspaceFile(
          user.id,
          projectId,
          citationPath,
          bibliographyContent,
        );
        citationAdded = true;
      }
    } else if (citationEntry.fields.file?.trim() !== fileField) {
      bibliographyContent = replaceBibtexEntry(currentBibliography, citationEntry, {
        type: citationEntry.type,
        key: citationEntry.key,
        fields: { ...citationEntry.fields, file: fileField },
      });
      await writeAgentWorkspaceFile(
        user.id,
        projectId,
        citationPath,
        bibliographyContent,
      );
      citationLinked = true;
    }
    revalidatePath(`/${projectId}`);
    return {
      success: true as const,
      pdfPath,
      alreadyExisted,
      citationKey: citationEntry?.key || stem,
      citationAdded,
      citationLinked,
      bibliographyContent,
    };
  } catch (error) {
    console.error("[literature-pdf-save] failed", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "The PDF could not be saved.",
    };
  }
}
