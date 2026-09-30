import { defineTool } from "eve/tools";
import { z } from "zod";

import { parseBibtexEntries } from "../../lib/bibtex";
import { ENTRY_TYPES } from "../../lib/bibliography-fields";
import {
  appendLiteratureItem,
  appendManualEntries,
  citedCitationKeys,
  editBibliographyEntry,
  removeBibliographyEntries,
  type BibliographyLiteratureItem,
} from "../../lib/bibliography-store";
import { lookupLiteratureWork, type LiteratureWork } from "../../lib/literature/search";
import { PROJECT_BIBLIOGRAPHY_PATH, REFERENCES_DIRECTORY } from "../../lib/project-bibliography";
import { resolveAuthenticatedWorkspace } from "../workspace-paths";
import {
  createAgentWorkspaceDirectory,
  globWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  WorkspaceFileError,
} from "../workspace-files";

type EntryType = (typeof ENTRY_TYPES)[number]["value"];
const ENTRY_TYPE_VALUES = ENTRY_TYPES.map((type) => type.value) as [EntryType, ...EntryType[]];

const manualEntrySchema = z
  .object({
    type: z
      .enum(ENTRY_TYPE_VALUES)
      .describe(
        "BibTeX entry type. Use 'online' for web pages, YouTube videos, podcasts, and other web sources; 'article' for journal papers, 'book'/'inbook' for books and chapters.",
      ),
    key: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Preferred citation key. Omit to generate one. Pass the document's existing token key when repairing a 'Missing reference'.",
      ),
    title: z.string().trim().min(1).max(2_000),
    authors: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .describe("BibTeX author names, 'Family, Given and Family, Given'."),
    year: z.string().trim().max(20).optional(),
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Full publication date for online sources, ISO YYYY-MM-DD."),
    container: z
      .string()
      .trim()
      .max(2_000)
      .optional()
      .describe("Journal, book, or proceedings title (stored as journal/booktitle by type)."),
    publisher: z.string().trim().max(2_000).optional(),
    volume: z.string().trim().max(100).optional(),
    issue: z.string().trim().max(100).optional().describe("Issue or number."),
    pages: z.string().trim().max(100).optional(),
    doi: z.string().trim().max(500).optional(),
    url: z.string().trim().max(4_000).optional(),
    abstract: z.string().trim().max(20_000).optional(),
    keywords: z.string().trim().max(2_000).optional(),
    note: z.string().trim().max(10_000).optional(),
    month: z.string().trim().max(50).optional().describe("3-letter abbreviation, e.g. 'mar'."),
    editor: z.string().trim().max(10_000).optional(),
    edition: z.string().trim().max(100).optional(),
    series: z.string().trim().max(500).optional(),
    address: z.string().trim().max(500).optional(),
    school: z.string().trim().max(500).optional(),
    institution: z.string().trim().max(500).optional(),
    organization: z.string().trim().max(500).optional().describe("Website owner, channel, or organization for online sources."),
    howpublished: z.string().trim().max(1_000).optional().describe("Format or platform, e.g. 'YouTube video' or 'Podcast episode'."),
    urldate: z.string().trim().max(50).optional().describe("Access date, ISO 'YYYY-MM-DD'."),
  })
  .strict();

const fieldPatchSchema = z
  .record(
    z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]*$/, "Use lowercase BibTeX field names")
      .max(40),
    z.string().max(20_000),
  )
  .describe(
    "BibTeX field name → new value. Common names: title, author, year, journal, booktitle, publisher, " +
      "volume, number, pages, doi, url, abstract, keywords, note. An empty string removes the field.",
  );

const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_papers"),
    paperIds: z
      .array(z.string().trim().min(3).max(300))
      .min(1)
      .max(25)
      .describe(
        "Paper identifiers: DOIs ('10.1038/nrn3241'), PMIDs, OpenAlex ids ('W1973275441'), provider URLs, " +
          "or ids returned by search_literature. Metadata is fetched and serialized server-side; the entry " +
          "gets the canonical generated key. The field name is paperIds (not ids). Put all papers in one array.",
      ),
  }).describe('Add papers: {"op":"add_papers","paperIds":["openalex:W...","doi:10..."]}'),
  z.object({
    op: z.literal("add_entries"),
    entries: z
      .array(manualEntrySchema)
      .min(1)
      .max(25)
      .describe("References described by hand, including web pages, videos, podcasts, and works no literature provider indexes. Verify title, creator, date, and URL against the source."),
  }),
  z.object({
    op: z.literal("edit_entries"),
    updates: z
      .array(
        z.object({
          key: z
            .string()
            .trim()
            .min(1)
            .max(300)
            .describe("Existing citation key, copied character for character from search_bibliography."),
          fields: fieldPatchSchema,
        }),
      )
      .min(1)
      .max(25),
  }),
  z.object({
    op: z.literal("remove_entries"),
    keys: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
    force: z
      .boolean()
      .default(false)
      .describe(
        "Remove even when documents still cite the key (their tokens would render 'Missing reference').",
      ),
  }),
]);

const updateBibliographyInputSchema = z
  .object({
    operations: z
      .array(operationSchema)
      .min(1)
      .max(40)
      .describe(
        "Operation objects applied in order, atomically. Every array item must contain an op discriminator. " +
        'Example for papers: [{"op":"add_papers","paperIds":["openalex:W123","doi:10.1000/example"]}].',
      ),
  })
  .strict();

type UpdateBibliographyInput = z.infer<typeof updateBibliographyInputSchema>;

type MutationOutcome = {
  content: string;
  added: Array<{ citationKey: string; alreadyExisted: boolean; paperId?: string }>;
  edited: string[];
  removed: string[];
  blockedCited: Array<{ key: string; documents: string[] }>;
  notFound: string[];
};

// The literature item is reconstructed exactly as the UI literature rail
// saves it, so the canonical fileStem key is identical on both paths.
function itemFromWork(work: LiteratureWork): BibliographyLiteratureItem {
  return {
    id: `openalex:${work.openalexId}`,
    title: work.title,
    authors: work.authors,
    year: work.year,
    doi: work.doi,
    pmid: work.pmid,
    venue: work.venue,
    url: work.url,
    abstract: work.abstract,
    keywords: work.keywords,
    citationCount: work.citationCount,
    isOpenAccess: work.isOpenAccess,
    sources: ["openalex"],
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

// Which of the requested removal keys are still cited by [@key] tokens in
// workspace markdown documents, so cited entries are not silently orphaned.
async function citationUsage(
  userId: string,
  projectSlug: string,
  keysOfInterest: ReadonlySet<string>,
): Promise<{ usage: Map<string, string[]>; truncated: boolean; unreadable: string[] }> {
  const usage = new Map<string, string[]>();
  const unreadable: string[] = [];
  if (!keysOfInterest.size) return { usage, truncated: false, unreadable };
  const { entries, truncated } = await globWorkspaceFiles(userId, projectSlug, "", "*.md", 500);
  for (const entry of entries) {
    try {
      const { content } = await readWorkspaceFile(userId, projectSlug, entry.path);
      for (const key of citedCitationKeys(content.toString("utf8"))) {
        const normalizedKey = key.toLocaleLowerCase();
        if (!keysOfInterest.has(normalizedKey)) continue;
        const documents = usage.get(normalizedKey) ?? [];
        documents.push(entry.path);
        usage.set(normalizedKey, documents);
      }
    } catch {
      unreadable.push(entry.path);
    }
  }
  return { usage, truncated, unreadable };
}

function applyOperations(
  initialContent: string,
  operations: UpdateBibliographyInput["operations"],
  paperItems: ReadonlyMap<string, BibliographyLiteratureItem>,
  usage: ReadonlyMap<string, string[]>,
): MutationOutcome {
  const outcome: MutationOutcome = {
    content: initialContent,
    added: [],
    edited: [],
    removed: [],
    blockedCited: [],
    notFound: [],
  };
  for (const operation of operations) {
    if (operation.op === "add_papers") {
      for (const paperId of operation.paperIds) {
        const item = paperItems.get(paperId);
        if (!item) continue; // lookup failures are reported in `errors`
        const result = appendLiteratureItem(outcome.content, item);
        outcome.content = result.content;
        outcome.added.push({
          paperId,
          citationKey: result.citationKey,
          alreadyExisted: result.alreadyExisted,
        });
      }
    } else if (operation.op === "add_entries") {
      const result = appendManualEntries(outcome.content, operation.entries);
      outcome.content = result.content;
      outcome.added.push(...result.added);
    } else if (operation.op === "edit_entries") {
      for (const update of operation.updates) {
        const result = editBibliographyEntry(outcome.content, update.key, update.fields);
        outcome.content = result.content;
        if (result.found) outcome.edited.push(update.key);
        else outcome.notFound.push(update.key);
      }
    } else if (operation.op === "remove_entries") {
      const removable: string[] = [];
      for (const key of operation.keys) {
        const documents = usage.get(key.toLocaleLowerCase());
        if (documents?.length && !operation.force) {
          outcome.blockedCited.push({ key, documents });
        } else {
          removable.push(key);
        }
      }
      const result = removeBibliographyEntries(outcome.content, removable);
      outcome.content = result.content;
      outcome.removed.push(...result.removed);
      outcome.notFound.push(...result.notFound);
    }
  }
  return outcome;
}

export default defineTool({
  description:
    "Add, edit, or remove entries in the project bibliography (/workspace/1-References/references.bib) " +
    "through atomic batched operations, and get back the exact citationKey for [@key] document tokens. " +
    'For the common add flow, call exactly {"operations":[{"op":"add_papers","paperIds":["openalex:W...","doi:10..."]}]}; ' +
    "operations contains objects, every object requires op, the field is paperIds (not ids), and multiple paper ids belong in one add_papers operation. " +
    "Citation keys are generated from the work's identity — never invent one. Prefer add_papers with ids " +
    "from search_literature or get_paper_details (DOI, PMID, OpenAlex id); the metadata is fetched and " +
    "serialized server-side. Use add_entries for web pages, videos, podcasts, other nonacademic sources, or works no provider indexes; verify metadata against the source. Use edit_entries to fix " +
    "fields of an existing key, and remove_entries to delete entries (cited entries are protected unless " +
    "forced). Existing entries for the same work are reused, never duplicated. This is the only way to " +
    "modify references.bib; write_file and edit_document are rejected there.",
  inputSchema: updateBibliographyInputSchema,
  async execute({ operations }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const { userId, projectSlug } = identity;

    // Network lookups and the document usage scan run before the write loop
    // so compare-and-swap retries never repeat them.
    const paperIds = [
      ...new Set(operations.flatMap((operation) => operation.op === "add_papers" ? operation.paperIds : [])),
    ];
    const paperItems = new Map<string, BibliographyLiteratureItem>();
    const errors: Array<{ item: string; error: string }> = [];
    await mapWithConcurrency(paperIds, 4, async (paperId) => {
      try {
        const { work } = await lookupLiteratureWork({ paperId });
        paperItems.set(paperId, itemFromWork(work));
      } catch (error) {
        errors.push({ item: paperId, error: error instanceof Error ? error.message : String(error) });
      }
    });

    const unforcedRemovalKeys = new Set(
      operations.flatMap((operation) => operation.op === "remove_entries" && !operation.force
        ? operation.keys.map((key) => key.toLocaleLowerCase())
        : []),
    );
    const { usage, truncated: usageTruncated, unreadable } = await citationUsage(
      userId,
      projectSlug,
      unforcedRemovalKeys,
    );

    const warnings: string[] = [];
    if (usageTruncated || unreadable.length) {
      const reason = usageTruncated
        ? "the workspace contains more than 500 Markdown documents"
        : `${unreadable.length} Markdown document(s) could not be read`;
      throw new Error(
        `Could not safely verify whether bibliography entries are cited because ${reason}. ` +
        "Retry the operation, or set force: true to remove without citation protection.",
      );
    }

    for (let attempt = 0; ; attempt += 1) {
      let current = "";
      let generation: string | undefined;
      try {
        const file = await readWorkspaceFile(userId, projectSlug, PROJECT_BIBLIOGRAPHY_PATH);
        current = file.content.toString("utf8");
        generation = file.generation;
      } catch (error) {
        if (!(error instanceof WorkspaceFileError && error.status === 404)) throw error;
      }

      const outcome = applyOperations(current, operations, paperItems, usage);
      const changed = outcome.content !== current;
      if (!changed) {
        return {
          path: `/workspace/${PROJECT_BIBLIOGRAPHY_PATH}`,
          created: false,
          changed: false,
          entryCount: parseBibtexEntries(outcome.content).length,
          added: outcome.added,
          edited: outcome.edited,
          removed: outcome.removed,
          blockedCited: outcome.blockedCited,
          notFound: outcome.notFound,
          errors,
          warnings,
        };
      }

      if (generation === undefined) {
        await createAgentWorkspaceDirectory(userId, projectSlug, REFERENCES_DIRECTORY).catch(() => undefined);
      }
      try {
        await writeWorkspaceFile(
          userId,
          projectSlug,
          PROJECT_BIBLIOGRAPHY_PATH,
          Buffer.from(outcome.content, "utf8"),
          { ifGenerationMatch: generation ?? 0 },
        );
      } catch (error) {
        if (
          error instanceof WorkspaceFileError &&
          error.code === "workspace_generation_mismatch" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
      return {
        path: `/workspace/${PROJECT_BIBLIOGRAPHY_PATH}`,
        created: generation === undefined,
        changed: true,
        entryCount: parseBibtexEntries(outcome.content).length,
        added: outcome.added,
        edited: outcome.edited,
        removed: outcome.removed,
        blockedCited: outcome.blockedCited,
        notFound: outcome.notFound,
        errors,
        warnings,
      };
    }
  },
});
