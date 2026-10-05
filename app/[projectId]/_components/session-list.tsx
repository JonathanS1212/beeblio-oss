"use client";

import { useEffect, useState } from "react";
import { SessionItem } from "./session-item";
import { getProjectSessions } from "../actions";

export type ProjectSession = Awaited<ReturnType<typeof getProjectSessions>>[number];
type SessionSummary = ProjectSession;
type CachedSessions = { sessions: SessionSummary[]; stale: boolean };

const sessionCache = new Map<string, CachedSessions>();
const pendingFetches = new Map<string, Promise<SessionSummary[]>>();
let cacheRevision = 0;
let listeningForSessionChanges = false;

function ensureCacheInvalidationListener() {
  if (listeningForSessionChanges) return;
  listeningForSessionChanges = true;
  // Keep this listener after the collapsible list unmounts. A conversation can
  // be created while history is closed, so its cached list must become stale.
  window.addEventListener("beeblio:session-created", () => {
    cacheRevision += 1;
    for (const cached of sessionCache.values()) cached.stale = true;
  });
}

function fetchSessions(projectId: string) {
  const pending = pendingFetches.get(projectId);
  if (pending) return pending;
  const revision = cacheRevision;
  const request = getProjectSessions(projectId)
    .then((sessions) => {
      sessionCache.set(projectId, { sessions, stale: revision !== cacheRevision });
      return sessions;
    })
    .finally(() => pendingFetches.delete(projectId));
  pendingFetches.set(projectId, request);
  return request;
}

export function SessionList({
  projectId,
  initialSessions,
  query,
  onSelectConversation,
  onDeleteConversation,
}: {
  projectId: string;
  initialSessions: SessionSummary[];
  query: string;
  onSelectConversation: (sessionId: string) => void;
  onDeleteConversation: (sessionId: string) => void;
}) {
  const cached = sessionCache.get(projectId);
  const [sessions, setSessions] = useState<SessionSummary[]>(cached?.sessions ?? initialSessions);
  const [loading, setLoading] = useState(
    (!cached && initialSessions.length === 0) || (cached?.stale && cached.sessions.length === 0) || false,
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    ensureCacheInvalidationListener();
    let active = true;
    const refresh = async () => {
      const current = sessionCache.get(projectId);
      if (current && !current.stale) {
        setSessions(current.sessions);
        setLoading(false);
        return;
      }
      if ((current?.sessions.length ?? initialSessions.length) === 0) setLoading(true);
      setError(false);
      try {
        let updated = await fetchSessions(projectId);
        // A newly persisted session may have invalidated an in-flight read.
        while (active && sessionCache.get(projectId)?.stale) {
          updated = await fetchSessions(projectId);
        }
        if (active) setSessions(updated);
      } catch (err) {
        console.error("Failed to refresh sessions:", err);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    void refresh();
    const handleSessionCreated = () => void refresh();
    window.addEventListener("beeblio:session-created", handleSessionCreated);
    return () => {
      active = false;
      window.removeEventListener("beeblio:session-created", handleSessionCreated);
    };
  }, [projectId, initialSessions]);

  if (loading && sessions.length === 0) {
    return (
      <div role="status" aria-label="Loading conversations" className="space-y-2 py-1">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-8 animate-pulse rounded-md bg-muted/70" />
        ))}
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs leading-5 text-muted-foreground">Couldn&apos;t load conversations. Close and reopen Chat History to retry.</div>;
  }

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
            setSessions((current) => {
              const updated = current.filter((item) => item.id !== session.id);
              sessionCache.set(projectId, { sessions: updated, stale: false });
              return updated;
            });
            onDeleteConversation(session.id);
          }}
          onRenamed={(newTitle) => {
            setSessions((current) => {
              const updated = current.map((item) => (item.id === session.id ? { ...item, title: newTitle } : item));
              sessionCache.set(projectId, { sessions: updated, stale: false });
              return updated;
            });
          }}
        />
      ))}
    </div>
  );
}
