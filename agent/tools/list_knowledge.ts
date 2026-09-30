import { defineTool } from "eve/tools";
import { z } from "zod";

import { listKnowledge } from "../../lib/knowledge";
import { resolveAuthenticatedWorkspace } from "../workspace-paths";

export default defineTool({
  description: "List the workspace files registered in the current project's Knowledge, including indexing status, errors, indexed time, and exact bibliography citationKey when the file is linked in references.bib. Use before adding files or planning a Knowledge-grounded report.",
  inputSchema: z.object({}).strict(),
  label: { start: () => "List Knowledge files" },
  async execute(_input, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const documents = await listKnowledge(identity.userId, identity.projectSlug);
    return {
      documents: documents.map((document) => ({ ...document, filePath: `/workspace/${document.filePath}` })),
      total: documents.length,
      ready: documents.filter((document) => document.status === "ready").length,
    };
  },
});
