import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { AgentChat } from "@/app/_components/agent-chat";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { getCreditsConfig, getCreditSummary } from "@/lib/credits";
import { parseProjectSettings } from "@/lib/project-settings";
import {
  DEMO_SUGGESTED_PROMPTS,
  isDemoProjectSlug,
} from "@/lib/demo-project-config";
import { getOwnedProject } from "../actions";

const toolCallVerbosity =
  process.env.AGENT_TOOL_CALL_VERBOSITY === "compact" ? "compact" : "full";
const reasoningVerbosity =
  process.env.AGENT_REASONING_VERBOSITY === "compact" ? "compact" : "full";

export default async function ProjectSessionPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId?: string[] }>;
}) {
  const { projectId, sessionId: sessionIdArray } = await params;
  const user = await requireUser();
  const sessionId = sessionIdArray?.[0];
  const [credits, project] = await Promise.all([
    getCreditSummary(user.id),
    getOwnedProject(user, projectId),
  ]);
  const settings = parseProjectSettings(project?.settings);
  const session = sessionId && project
    ? await db.query.agentSessions.findFirst({
        where: and(
          eq(agentSessions.id, sessionId),
          eq(agentSessions.projectId, project.id),
          isNull(agentSessions.deletedAt),
        ),
      })
    : null;
  const creditConfig = getCreditsConfig();
  const creditProps = {
    initialCredits: credits,
    creditExecutionClass: creditConfig.defaultExecutionClass,
    reservationAmount:
      creditConfig.reservationAmounts[creditConfig.defaultExecutionClass],
  };

  const suggestedPrompts = isDemoProjectSlug(projectId)
    ? DEMO_SUGGESTED_PROMPTS
    : undefined;

  if (!sessionId) {
    // New session
    return (
      <AgentChat
        key={`${projectId}:new`}
        projectId={projectId}
        toolCallVerbosity={toolCallVerbosity}
        reasoningVerbosity={reasoningVerbosity}
        suggestedPrompts={suggestedPrompts}
        includeSystemSkills={settings.includeSystemSkills}
        modelSource={settings.openRouter.enabled ? "byok" : "system"}
        modelId={settings.openRouter.enabled ? settings.openRouter.modelId : undefined}
        modelContextWindowTokens={settings.openRouter.enabled ? settings.openRouter.contextLength : undefined}
        {...creditProps}
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
      suggestedPrompts={suggestedPrompts}
      includeSystemSkills={settings.includeSystemSkills}
      modelSource={session.modelSource as "system" | "byok"}
      modelId={session.modelId ?? undefined}
      modelContextWindowTokens={session.modelContextWindowTokens ?? undefined}
      {...creditProps}
    />
  );
}
