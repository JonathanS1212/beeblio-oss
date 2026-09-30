"use server";

import { requireUser } from "@/lib/auth/session";
import { getAgentStorageUsage } from "@/lib/workspace-gcs";

export async function getStorageUsage() {
  const user = await requireUser();
  return getAgentStorageUsage(user.id);
}
