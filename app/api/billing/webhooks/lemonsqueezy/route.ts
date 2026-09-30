import { billingError, errorResponse } from "@/lib/billing/http";
import { verifyLemonSqueezySignature } from "@/lib/billing/lemonsqueezy";
import {
  processLemonSqueezyWebhook,
  type LemonSqueezyOrderWebhook,
} from "@/lib/billing/lemonsqueezy-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!verifyLemonSqueezySignature(rawBody, request.headers.get("x-signature"))) {
      throw billingError("Invalid webhook signature", 401);
    }
    let payload: LemonSqueezyOrderWebhook;
    try {
      payload = JSON.parse(rawBody) as LemonSqueezyOrderWebhook;
    } catch {
      throw billingError("Invalid webhook payload", 400);
    }
    const result = await processLemonSqueezyWebhook(payload);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
