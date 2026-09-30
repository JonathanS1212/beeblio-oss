import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth/session";
import {
  EQUATION_LATEX_MAX_CHARS,
  EQUATION_PROMPT_MAX_CHARS,
  generateEquationLatex,
} from "@/lib/equation-latex";

/** Turns a plain-language description into LaTeX for the equation editor. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, prompt, latex, kind } = (body ?? {}) as { projectId?: unknown; prompt?: unknown; latex?: unknown; kind?: unknown };
  if (typeof projectId !== "string") return NextResponse.json({ error: "Project is required." }, { status: 400 });
  const description = typeof prompt === "string" ? prompt.trim() : "";
  if (!description) return NextResponse.json({ error: "Describe the equation you want." }, { status: 400 });
  if (description.length > EQUATION_PROMPT_MAX_CHARS) {
    return NextResponse.json({ error: "Description is too long." }, { status: 400 });
  }
  const draftLatex = typeof latex === "string" ? latex : "";
  if (draftLatex.length > EQUATION_LATEX_MAX_CHARS) {
    return NextResponse.json({ error: "LaTeX draft is too long." }, { status: 400 });
  }

  const result = await generateEquationLatex({
    userId: user.id,
    projectId,
    prompt: description,
    latex: draftLatex,
    kind: kind === "block" ? "block" : "inline",
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
