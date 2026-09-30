import { defineTool } from "eve/tools";
import { z } from "zod";

import { searchBibliographyEntries } from "../../lib/bibliography-store";
import { PROJECT_BIBLIOGRAPHY_PATH } from "../../lib/project-bibliography";
import { resolveAuthenticatedWorkspace } from "../workspace-paths";
import { readWorkspaceFile, WorkspaceFileError } from "../workspace-files";

const inputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(300)
      .optional()
      .describe(
        "Every whitespace-separated token must appear in the entry's key, title, authors, year, venue, publisher, or DOI (case-insensitive), e.g. 'smith 2020 naming'. Omit to list the library.",
      ),
    keys: z
      .array(z.string().trim().min(1).max(300))
      .min(1)
      .max(50)
      .optional()
      .describe("Exact citation keys to look up."),
    limit: z.number().int().min(1).max(100).default(50).describe("Maximum entries to return."),
    includeAbstract: z
      .boolean()
      .default(false)
      .describe("Include a truncated abstract per entry (omitted by default to keep output compact)."),
  })
  .strict();

export default defineTool({
  description:
    "Search or list the citations in the project bibliography (/workspace/1-References/references.bib) " +
    "and get the exact citationKey for [@key] document tokens. Returns compact records (key, type, title, " +
    "authors, year, venue, DOI) without reading the whole file. Use it to check whether a work is already " +
    "in the library before adding it, and to copy keys character for character before citing. " +
    "To add, edit, or remove entries use update_bibliography.",
  inputSchema,
  async execute({ query, keys, limit, includeAbstract }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });

    let source = "";
    try {
      const { content } = await readWorkspaceFile(
        identity.userId,
        identity.projectSlug,
        PROJECT_BIBLIOGRAPHY_PATH,
      );
      source = content.toString("utf8");
    } catch (error) {
      if (!(error instanceof WorkspaceFileError && error.status === 404)) throw error;
    }

    const { entries, totalCount, truncated } = searchBibliographyEntries(source, {
      query,
      keys,
      limit,
      includeAbstract,
    });
    return {
      path: `/workspace/${PROJECT_BIBLIOGRAPHY_PATH}`,
      totalCount,
      entries,
      truncated,
    };
  },
});
