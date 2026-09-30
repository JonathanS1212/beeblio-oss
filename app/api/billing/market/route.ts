import { cookies } from "next/headers";

import { BILLING_MARKET_COOKIE, billingMarket } from "@/lib/billing/market";
import { billingError, errorResponse, jsonBody } from "@/lib/billing/http";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request, 1_000);
    const market = billingMarket(body?.market);
    if (!market) throw billingError("Invalid billing market", 400);
    (await cookies()).set(BILLING_MARKET_COOKIE, market, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return Response.json({ market });
  } catch (error) {
    return errorResponse(error);
  }
}
