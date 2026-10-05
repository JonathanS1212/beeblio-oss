import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { AgentChat } from "@/app/_components/agent-chat";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { parseProjectSettings } from "@/lib/project-settings";
import { getOwnedProject } from "../actions";

const toolCallVerbosity =
  process.env.AGENT_TOOL_CALL_VERBOSITY === "full" ? "full" : "compact";
const reasoningVerbosity =
  process.env.AGENT_REASONING_VERBOSITY === "full" ? "full" : "compact";

export default async function ProjectSessionPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId?: string[] }>;
}) {
  const { projectId, sessionId: sessionIdArray } = await params;
  const user = await requireUser();
  const sessionId = sessionIdArray?.[0];
  const project = await getOwnedProject(user, projectId);
  const settings = parseProjectSettings(project?.settings);
  const session = sessionId && project
    ? await db.query.agentSessions.findFirst({
        columns: { id: true, state: true, events: true },
        where: and(
          eq(agentSessions.id, sessionId),
          eq(agentSessions.projectId, project.id),
          isNull(agentSessions.deletedAt),
        ),
      })
    : null;
  if (!sessionId) {
    // New session
    return (
      <AgentChat
        key={`${projectId}:new`}
        projectId={projectId}
        toolCallVerbosity={toolCallVerbosity}
        reasoningVerbosity={reasoningVerbosity}
        includeSystemSkills={settings.includeSystemSkills}
      />
    );
  }

  // Existing session
  if (!session) notFound();

  return (
    <AgentChat
      key={`${projectId}:${sessionId}`}
      projectId={projectId}
      sessionId={sessionId}
      initialState={(session.state ?? undefined) as ClientSessionState | undefined}
      initialEvents={(session.events ?? undefined) as MessageStreamEvent[] | undefined}
      toolCallVerbosity={toolCallVerbosity}
      reasoningVerbosity={reasoningVerbosity}
      includeSystemSkills={settings.includeSystemSkills}
    />
  );
}
