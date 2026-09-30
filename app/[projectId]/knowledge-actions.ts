"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  listKnowledge,
  processKnowledgeDocument,
  queueKnowledgeFile,
  removeKnowledgeDocument,
  searchProjectKnowledge,
} from "@/lib/knowledge";

const knowledgeQuerySchema = z.string().trim().min(2).max(2_000);

export async function listKnowledgeDocuments(projectId: string) {
  const user = await requireUser();
  return listKnowledge(user.id, projectId);
}

export async function addFileToKnowledge(projectId: string, filePath: string) {
  const user = await requireUser();
  let result: Awaited<ReturnType<typeof queueKnowledgeFile>>;
  try {
    result = await queueKnowledgeFile(user.id, projectId, filePath);
  } catch (error) {
    if (error instanceof Error && /API_KEY_INVALID|API key not valid/i.test(error.message)) {
      return {
        kind: "configuration_error" as const,
        error: "Google rejected GOOGLE_API_KEY. Create a Gemini API key in Google AI Studio, update .env.local, and restart pnpm dev.",
      };
    }
    throw error;
  }
  if (result.kind === "queued") {
    after(() => processKnowledgeDocument(user.id, projectId, result.document.id).catch((error) => {
      console.error("[knowledge] background processing failed", error);
    }));
  }
  revalidatePath(`/${projectId}`);
  return result;
}

export async function removeFileFromKnowledge(projectId: string, documentId: string) {
  const user = await requireUser();
  await removeKnowledgeDocument(user.id, projectId, documentId);
  revalidatePath(`/${projectId}`);
}

export async function searchKnowledge(projectId: string, rawQuery: string) {
  const user = await requireUser();
  const query = knowledgeQuerySchema.parse(rawQuery);
  return (await searchProjectKnowledge(user.id, projectId, query)).result;
}
