import { z } from "zod";

import { getUser } from "@/lib/auth/session";
import { searchProjectKnowledge, type KnowledgeSearchResult } from "@/lib/knowledge";

const inputSchema = z.object({
  projectId: z.string().min(1).max(200),
  query: z.string().trim().min(2).max(2_000),
});

type SearchEvent =
  | { type: "delta"; text: string }
  | { type: "result"; result: KnowledgeSearchResult }
  | { type: "error"; message: string };

export async function POST(request: Request): Promise<Response> {
  const user = await getUser();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid Knowledge query." }, { status: 400 });

  const { projectId, query } = parsed.data;
  const encoder = new TextEncoder();
  const providerAbort = new AbortController();
  if (request.signal.aborted) providerAbort.abort();
  else request.signal.addEventListener("abort", () => providerAbort.abort(), { once: true });
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SearchEvent) => {
        if (!cancelled && !providerAbort.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const { result } = await searchProjectKnowledge(user.id, projectId, query, {
          abortSignal: providerAbort.signal,
          onTextDelta: (text) => send({ type: "delta", text }),
        });
        send({ type: "result", result });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Knowledge search failed." });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      providerAbort.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
