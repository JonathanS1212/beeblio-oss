import { defineTool } from "eve/tools";
import { z } from "zod";

import { listKnowledge, processKnowledgeDocument, queueKnowledgeFile } from "../../lib/knowledge";
import { resolveAuthenticatedWorkspace, toWorkspaceRelativePath } from "../workspace-paths";

export default defineTool({
  description: "Index an existing workspace file in the current project's Knowledge so it can be searched semantically. This does not create or move the workspace file. Indexing runs in the background; use list_knowledge later to inspect its status. Re-indexes the path when its workspace content has changed.",
  inputSchema: z.object({
    filePath: z.string().trim().min(1).describe("Existing file path inside /workspace."),
  }).strict(),
  execution: "background",
  label: {
    start: ({ filePath }) => `Add ${filePath} to Knowledge`,
    complete: ({ filePath }) => `Finished indexing ${filePath}`,
  },
  async execute({ filePath }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const workspacePath = toWorkspaceRelativePath(filePath);
    const queued = await queueKnowledgeFile(identity.userId, identity.projectSlug, workspacePath);
    if (queued.kind === "queued") {
      await processKnowledgeDocument(identity.userId, identity.projectSlug, queued.document.id);
    }
    const documents = await listKnowledge(identity.userId, identity.projectSlug);
    const document = documents.find((candidate) => candidate.id === queued.document.id) ?? queued.document;
    return {
      kind: queued.kind,
      document: { ...document, filePath: `/workspace/${document.filePath}` },
    };
  },
});
