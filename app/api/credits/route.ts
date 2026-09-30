import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth/session";
import { getCreditSummary, getRecentCreditUsage } from "@/lib/credits";
import { getEntitlements } from "@/lib/entitlements/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (new URL(request.url).searchParams.get("summaryOnly") === "1") {
    const summary = await getCreditSummary(user.id);
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  }

  const [summary, usage, entitlements] = await Promise.all([
    getCreditSummary(user.id),
    getRecentCreditUsage(user.id),
    getEntitlements(user.id),
  ]);
  return NextResponse.json(
    { summary, usage, plan: entitlements.plan },
    { headers: { "Cache-Control": "no-store" } },
  );
}
