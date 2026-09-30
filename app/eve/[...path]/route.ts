import { after, NextRequest } from "next/server";

import { mintAgentToken } from "@/lib/agent-token";
import { getUser } from "@/lib/auth/session";
import {
  findActiveReservation,
  FreeTurnLimitError,
  finishReservation,
  getCreditsConfig,
  InsufficientCreditsError,
  parseExecutionClass,
  reserveCredits,
} from "@/lib/credits";
import { getAgentStorageUsage } from "@/lib/workspace-gcs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import { getUserPlan } from "@/lib/entitlements/user";
import { getOpenRouterCredential } from "@/lib/openrouter-credential";
import { parseProjectSettings } from "@/lib/project-settings";
import { generateConversationTitle } from "@/lib/conversation-title";
import { TURN_MODEL_DEADLINE_MS } from "@/agent/lib/model-timeout";

export const maxDuration = 300; // Allow streams to run up to 5 minutes on Vercel
export const dynamic = "force-dynamic";

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } },
) {
  const proxyStartedAt = Date.now();
  // Await params to support both Next.js 14 and 15+
  const resolvedParams = await params;
  const targetPath = resolvedParams.path.join("/");
  if (!isAllowedEveRoute(req.method, targetPath)) return new Response("Not found", { status: 404 });
  if (req.method === "POST") {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > 64 * 1024) return new Response("Request too large", { status: 413 });
  }

  // Trim trailing slashes: on Vercel this value comes from the eve service
  // binding (vercel.json services.web.bindings), whose injected URL base may
  // end in "/" — untrimmed it would produce "//eve/v1/..." below and miss the
  // eve service's routes.
  const backendUrl = process.env.AGENT_URL?.trim().replace(/\/+$/, "");
  if (!backendUrl) {
    return new Response("Missing AGENT_URL in environment", { status: 500 });
  }

  // Authenticate the Neon Auth user, then mint a short-lived agent token. The
  // eve channel verifies this JWT, so the agent backend trusts the same user.
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const agentToken = mintAgentToken(user.id);

  const searchParams = req.nextUrl.search; // Preserves ?startIndex=15 etc.
  let requestBody: string | undefined;
  let reservation:
    | { id: string; executionClass: "economy" | "standard" | "deep" }
    | null = null;
  let modelConfig: { source: "system" | "byok"; modelId?: string; contextLength?: number } = { source: "system" };
  let newConversationProjectId: string | undefined;
  let turnModelDeadlineAt: number | undefined;

  if (req.method !== "GET" && req.method !== "HEAD") {
    requestBody = await req.text();
    if (requestBody.length > 64 * 1024) return new Response("Request too large", { status: 413 });
  }

  if (req.method === "POST" && isTurnRoute(targetPath)) {
    const eveSessionId = sessionIdFromTurnRoute(targetPath);
    const existing = eveSessionId
      ? await db.select({ source: agentSessions.modelSource, modelId: agentSessions.modelId, contextLength: agentSessions.modelContextWindowTokens })
          .from(agentSessions).innerJoin(projects, eq(agentSessions.projectId, projects.id))
          .where(and(eq(agentSessions.eveSessionId, eveSessionId), eq(projects.userId, user.id))).then((rows) => rows[0])
      : undefined;
    if (existing) {
      modelConfig = { source: existing.source as "system" | "byok", modelId: existing.modelId ?? undefined, contextLength: existing.contextLength ?? undefined };
    } else {
      // A new conversation inherits the project's current preference. Never
      // trust browser-provided model headers for entitlement or billing.
      const projectSlug = req.headers.get("x-project-slug")?.trim();
      const project = projectSlug
        ? await db.query.projects.findFirst({
            columns: { id: true, settings: true },
            where: and(eq(projects.slug, projectSlug), eq(projects.userId, user.id)),
          })
        : undefined;
      newConversationProjectId = project?.id;
      const preference = parseProjectSettings(project?.settings).openRouter;
      if (project && preference.enabled) {
        modelConfig = {
          source: "byok",
          modelId: preference.modelId,
          contextLength: preference.contextLength,
        };
      }
    }
    if (modelConfig.source === "byok") {
      const [plan, credential] = await Promise.all([getUserPlan(user.id), getOpenRouterCredential(user.id)]);
      if (plan === "free" || !credential) return Response.json({ error: "Reconnect your OpenRouter key to continue this conversation.", code: "byok_unavailable" }, { status: 403 });
    }
  }

  if (
    req.method === "POST" &&
    isTurnRoute(targetPath)
  ) {
    const body = parseJsonObject(requestBody);
    const hasUserMessage = body !== null && body.message !== undefined;
    if (hasUserMessage || (Array.isArray(body?.inputResponses) && body.inputResponses.length > 0)) {
      turnModelDeadlineAt = Date.now() + TURN_MODEL_DEADLINE_MS;
    }
    const creditsEnabled = getCreditsConfig().enabled;
    const executionClass = parseExecutionClass(
      req.headers.get("x-beeblio-execution-class"),
    );

    // Storage turn-gate backstop (docs/entitlements-plan.md §11): agent-side
    // writes (bash / write_file inside the sandbox) bypass the per-write quota
    // check, so block *new* metered work once the user is at their quota.
    // History, stream, and file access are never gated. Fails open when the
    // agent cannot be reached — the per-write checks still enforce.
    if (hasUserMessage) {
      // The storage gate and the credit reservation are independent checks;
      // run them concurrently so neither round trip serializes behind the
      // other on the send critical path. When the storage gate trips after a
      // reservation was created, release it (the "proxy_error" finish outcome
      // exists for exactly this) so the user's credits are not held.
      const requestId = validRequestId(req.headers.get("x-beeblio-request-id"))
        ? req.headers.get("x-beeblio-request-id")!
        : crypto.randomUUID();
      const creditReservation = creditsEnabled
        ? reserveCredits({ userId: user.id, requestId, executionClass })
            .then((created) => ({ ok: true as const, created }))
            .catch((error: unknown) => ({ ok: false as const, error }))
        : Promise.resolve({ ok: true as const, created: null });
      const [storage, reserved] = await Promise.all([
        getAgentStorageUsage(user.id),
        creditReservation,
      ]);

      if (storage && storage.quotaBytes !== null && storage.usedBytes >= storage.quotaBytes) {
        if (reserved.ok && reserved.created) {
          await finishReservation(reserved.created.id, "proxy_error").catch(
            () => undefined,
          );
        }
        return Response.json(
          {
            error: "Your workspace is full. Delete files or upgrade your plan to continue using AI.",
            code: "storage_quota_exceeded",
            usedBytes: storage.usedBytes,
            quotaBytes: storage.quotaBytes,
          },
          { status: 402 },
        );
      }

      if (!reserved.ok) {
        const error = reserved.error;
        if (error instanceof FreeTurnLimitError) {
          return Response.json({ error: error.message, code: error.code }, { status: 429 });
        }
        if (error instanceof InsufficientCreditsError) {
          return Response.json(
            {
              error: "You’ve reached your usage limit — top up or wait for your refresh to continue.",
              code: "insufficient_credits",
              required: error.required,
              available: error.available,
            },
            { status: 402 },
          );
        }
        console.error("Credit reservation failed:", error);
        return Response.json(
          { error: "Unable to verify the credit balance. Please try again." },
          { status: 503 },
        );
      }

      if (reserved.created) {
        reservation = { id: reserved.created.id, executionClass };
      }
    } else if (creditsEnabled) {
      try {
        const eveSessionId = sessionIdFromTurnRoute(targetPath);
        if (eveSessionId) {
          const active = await findActiveReservation(user.id, eveSessionId);
          if (active) {
            reservation = {
              id: active.id,
              executionClass: active.execution_class,
            };
          } else if (
            Array.isArray(body?.inputResponses) &&
            body.inputResponses.length > 0
          ) {
            const requestId = validRequestId(req.headers.get("x-beeblio-request-id"))
              ? req.headers.get("x-beeblio-request-id")!
              : crypto.randomUUID();
            const created = await reserveCredits({
              userId: user.id,
              requestId,
              executionClass,
            });
            if (created) reservation = { id: created.id, executionClass };
          }
        }
      } catch (error) {
        if (error instanceof FreeTurnLimitError) {
          return Response.json({ error: error.message, code: error.code }, { status: 429 });
        }
        if (error instanceof InsufficientCreditsError) {
          return Response.json(
            {
              error: "You’ve reached your usage limit — top up or wait for your refresh to continue.",
              code: "insufficient_credits",
              required: error.required,
              available: error.available,
            },
            { status: 402 },
          );
        }
        console.error("Credit reservation failed:", error);
        return Response.json(
          { error: "Unable to verify the credit balance. Please try again." },
          { status: 503 },
        );
      }
    }
  }

  // Register a new app conversation inside the same request that starts Eve,
  // after all turn gates pass but before work is forwarded upstream.
  if (req.method === "POST" && targetPath === "v1/session") {
    const appSessionId = req.headers.get("x-beeblio-app-session-id")?.trim();
    const projectId = newConversationProjectId;
    if (appSessionId) {
      if (!isUuid(appSessionId) || !projectId) {
        return Response.json({ error: "Invalid conversation registration." }, { status: 400 });
      }
      const body = parseJsonObject(requestBody);
      const firstMessage = messageText(body?.message);
      const initialTitle = "New Conversation";
      // Start the registration insert now but never await it on the forwarding
      // path; after() keeps the invocation alive until it settles. The row
      // still lands within one DB round trip — long before the first stream
      // event, against which the client persists its session cursor and the
      // sidebar refetches — so end-of-turn after() work is too late, while
      // blocking the forward on this write is needlessly slow.
      const registration = db
        .insert(agentSessions)
        .values({
          id: appSessionId,
          projectId,
          title: initialTitle,
          modelSource: modelConfig.source,
          modelId: modelConfig.modelId ?? null,
          modelContextWindowTokens: modelConfig.contextLength ?? null,
        })
        .onConflictDoNothing({ target: agentSessions.id });
      // The catch both starts the (lazy) drizzle query immediately and keeps
      // an early rejection from surfacing as an unhandled rejection before
      // after() consumes it.
      registration.catch(() => undefined);
      after(async () => {
        try {
          await registration;
        } catch (error) {
          console.error("Conversation registration failed:", error);
          return;
        }
        try {
          const title = await generateConversationTitle(firstMessage);
          await db
            .update(agentSessions)
            .set({ title, updatedAt: new Date() })
            .where(and(eq(agentSessions.id, appSessionId), eq(agentSessions.title, initialTitle)));
        } catch (error) {
          console.error("Conversation title update failed:", error);
        }
      });
    }
  }

  // Forward the request, swapping the app session cookie for the agent token.
  const headers = new Headers(req.headers);
  headers.delete("host"); // Let fetch set the host to backendUrl
  headers.delete("cookie"); // Never leak Neon Auth session cookies to the agent
  // Hop-by-hop framing headers describe the browser→Vercel leg, not this
  // fetch. Vercel's front tier re-frames inbound requests as chunked, and
  // undici rejects an outgoing fetch that carries transfer-encoding
  // (UND_ERR_INVALID_ARG). fetch recomputes framing and content-length from
  // the body passed below, so they must not be forwarded.
  for (const hopByHop of [
    "transfer-encoding",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade",
  ]) {
    headers.delete(hopByHop);
  }
  // Always let undici negotiate upstream compression itself: when an explicit
  // accept-encoding is forwarded undici passes compressed bytes through
  // untouched, and when it is absent (Vercel's front tier strips it) undici
  // requests gzip and auto-decompresses — two different behaviors. Pinning to
  // the second keeps the response handling below correct in every host.
  headers.delete("accept-encoding");
  headers.delete("x-credit-reservation-id");
  headers.delete("x-credit-execution-class");
  headers.delete("x-beeblio-model-source");
  headers.delete("x-beeblio-model-id");
  headers.delete("x-beeblio-model-context-window-tokens");
  headers.delete("x-beeblio-app-session-id");
  headers.delete("x-turn-model-deadline-at");
  if (turnModelDeadlineAt) headers.set("x-turn-model-deadline-at", String(turnModelDeadlineAt));
  headers.set("x-model-source", modelConfig.source);
  if (modelConfig.modelId) headers.set("x-model-id", modelConfig.modelId);
  if (modelConfig.contextLength) headers.set("x-model-context-window-tokens", String(modelConfig.contextLength));
  headers.set("authorization", `Bearer ${agentToken}`);
  if (reservation) {
    headers.set("x-credit-reservation-id", reservation.id);
    headers.set("x-credit-execution-class", reservation.executionClass);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = requestBody;
  }

  // Turn sends are the latency-sensitive path; stream polls (GET) are quiet
  // long-polls that would drown the log in noise.
  const isTurnSend = req.method === "POST" && isTurnRoute(targetPath);
  if (isTurnSend) {
    // console.log("[eve:proxy] gates done", {
    //   path: targetPath,
    //   ms: Date.now() - proxyStartedAt,
    // });
  }

  try {
    const response = await fetch(
      `${backendUrl}/eve/${targetPath}${searchParams}`,
      init,
    );
    if (isTurnSend) {
      // Time until the eve service returned response headers — for a turn
      // send this includes the backend's session-creation/acceptance work.
      // console.log("[eve:proxy] upstream responded", {
      //   path: targetPath,
      //   ms: Date.now() - proxyStartedAt,
      // });
    }

    // Return the response directly so the streaming body passes through to
    // the client. undici auto-decompresses the upstream body but the fetch
    // spec keeps content-encoding/content-length in response.headers —
    // forwarding them makes the browser gunzip already-decoded bytes
    // (ERR_CONTENT_DECODING_FAILED on the SSE stream). Vercel's front tier
    // re-compresses the final response where worthwhile.
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response("Error proxying to agent", { status: 502 });
  }
}

export { proxy as GET, proxy as POST };

function isAllowedEveRoute(method: string, path: string): boolean {
  if (method === "GET") return path === "v1/health" || /^v1\/session\/[^/]+\/stream$/.test(path);
  if (method !== "POST") return false;
  // The UI uses cancel; compact/clear/reset are not exposed and compact can
  // consume model tokens outside the ordinary message reservation path.
  return isTurnRoute(path) || /^v1\/session\/[^/]+\/cancel$/.test(path);
}

function isTurnRoute(path: string) {
  return (
    path === "v1/session" ||
    (/^v1\/session\/[^/]+$/.test(path) && path !== "v1/session/reset")
  );
}

function sessionIdFromTurnRoute(path: string) {
  const match = path.match(/^v1\/session\/([^/]+)$/);
  return match?.[1] === "reset" ? undefined : match?.[1];
}

function parseJsonObject(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function validRequestId(value: string | null): value is string {
  return Boolean(value && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function messageText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const text = value
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"),
    )
    .map((part) => part.text)
    .join(" ")
    .trim();
  return text || undefined;
}
