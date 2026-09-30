"use client";

import { useEffect, useState } from "react";
import { SessionItem } from "./session-item";
import { getProjectSessions } from "../actions";

export type ProjectSession = Awaited<ReturnType<typeof getProjectSessions>>[number];

export function SessionList({
  projectId,
  initialSessions,
  query,
  onSelectConversation,
  onDeleteConversation,
}: {
  projectId: string;
  initialSessions: ProjectSession[];
  query: string;
  onSelectConversation: (sessionId: string) => void;
  onDeleteConversation: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState(initialSessions);

  useEffect(() => {
    const handleRefresh = async () => {
      try {
        const updated = await getProjectSessions(projectId);
        setSessions(updated);
      } catch (err) {
        console.error("Failed to refresh sessions:", err);
      }
    };

    // The collapsible history panel unmounts this list while it is closed, so
    // the session-created event is easily missed. Refresh on mount (i.e. every
    // time the panel opens) to pick up sessions created in the meantime.
    void handleRefresh();
    window.addEventListener("beeblio:session-created", handleRefresh);
    return () => window.removeEventListener("beeblio:session-created", handleRefresh);
  }, [projectId]);

  if (sessions.length === 0) {
    return <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs leading-5 text-muted-foreground">Your analysis threads will appear here.</div>;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSessions = normalizedQuery
    ? sessions.filter((session) =>
        (session.title || "New Session").toLocaleLowerCase().includes(normalizedQuery),
      )
    : sessions;

  if (filteredSessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs leading-5 text-muted-foreground">
        No conversations match &quot;{query.trim()}&quot;.
      </div>
    );
  }

  return (
    <div className="w-0 min-w-full max-w-full overflow-hidden pr-3">
      {filteredSessions.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          projectId={projectId}
          onSelect={() => onSelectConversation(session.id)}
          onDeleted={() => {
            setSessions((current) => current.filter((item) => item.id !== session.id));
            onDeleteConversation(session.id);
          }}
          onRenamed={(newTitle) => {
            setSessions((current) =>
              current.map((item) => (item.id === session.id ? { ...item, title: newTitle } : item)),
            );
          }}
        />
      ))}
    </div>
  );
}
