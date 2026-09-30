import "server-only";

const PRODUCTION_URL = "https://api.mayar.id/hl/v2";

function required(name: "MAYAR_API_KEY" | "MAYAR_WEBHOOK_TOKEN") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function mayar(path: string, init?: RequestInit) {
  const response = await fetch(`${PRODUCTION_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${required("MAYAR_API_KEY")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.statusCode >= 400) {
    console.error("[billing] Mayar request failed", response.status, payload?.messages ?? payload?.message);
    throw Object.assign(new Error("Could not communicate with Mayar"), { status: 502 });
  }
  return payload;
}

export async function createMayarPayment(input: {
  name: string;
  email: string;
  mobile: string;
  amount: number;
  description: string;
  redirectUrl: string;
}) {
  const expiredAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const payload = await mayar("/payments/create", {
    method: "POST",
    body: JSON.stringify({ ...input, expiredAt }),
  });
  const data = payload?.data;
  const checkoutId = data?.id;
  const transactionId = data?.transactionId ?? data?.transaction_id;
  const checkoutUrl = data?.link;
  if (typeof checkoutId !== "string" || typeof transactionId !== "string" || typeof checkoutUrl !== "string") {
    throw Object.assign(new Error("Mayar returned an invalid checkout"), { status: 502 });
  }
  return { checkoutId, transactionId, checkoutUrl };
}

export async function getMayarPayment(id: string) {
  return (await mayar(`/payments/${encodeURIComponent(id)}`))?.data;
}

export function mayarWebhookToken() {
  return required("MAYAR_WEBHOOK_TOKEN");
}
