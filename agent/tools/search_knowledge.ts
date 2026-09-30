import { defineTool, type ToolContext } from "eve/tools";
import { z } from "zod";

import { searchProjectKnowledge } from "../../lib/knowledge";
import { resolveAuthenticatedWorkspace, toWorkspaceRelativePath } from "../workspace-paths";

export default defineTool({
  description: "Semantically search the files indexed in this project's Knowledge. Returns a grounded synthesis plus the retrieved source passages, workspace filename, page number when available, and exact bibliography citationKey when the source PDF is linked in references.bib. For a broad report or literature synthesis, make several focused searches (for example methods, results, limitations, and conflicting evidence) instead of relying on one query. Use filePaths to constrain a search to selected indexed sources.",
  inputSchema: z.object({
    query: z.string().trim().min(2).max(2_000).describe("A focused semantic search question for the project's Knowledge files."),
    filePaths: z.array(z.string().trim().min(1)).max(50).optional().describe("Optional workspace paths restricting retrieval to selected Knowledge files."),
    topK: z.number().int().min(1).max(20).default(8).describe("Maximum number of relevant chunks for Gemini File Search to retrieve."),
  }).strict(),
  label: { start: ({ query }) => `Search Knowledge: ${query.slice(0, 100)}` },
  async execute({ query, filePaths, topK }, ctx: ToolContext) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const { result } = await searchProjectKnowledge(identity.userId, identity.projectSlug, query, {
      abortSignal: ctx.abortSignal,
      filePaths: filePaths?.map(toWorkspaceRelativePath),
      topK,
    });
    return result;
  },
});

