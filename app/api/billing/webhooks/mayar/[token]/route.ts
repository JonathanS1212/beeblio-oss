import { timingSafeEqual } from "node:crypto";

import { billingError, errorResponse } from "@/lib/billing/http";
import { mayarWebhookToken } from "@/lib/billing/mayar";
import { processMayarWebhook } from "@/lib/billing/mayar-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const supplied = (await context.params).token;
    const expected = mayarWebhookToken();
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw billingError("Invalid webhook token", 401);
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 100_000) throw billingError("Webhook payload is too large", 413);
    const payload = JSON.parse(raw);
    return Response.json(await processMayarWebhook(payload));
  } catch (error) {
    return errorResponse(error);
  }
}
