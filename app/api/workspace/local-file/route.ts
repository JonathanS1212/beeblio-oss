import { readWorkspaceFileAsResponse, verifyWorkspaceTicket, writeWorkspaceFile, WorkspaceFileError } from "@/lib/workspace-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function download(request: Request, head: boolean) {
  try {
    const claims = verifyWorkspaceTicket(new URL(request.url).searchParams.get("token") || "");
    const response = await readWorkspaceFileAsResponse(claims.userId, claims.slug, claims.workspacePath, { ifNoneMatch: request.headers.get("if-none-match") || undefined, range: request.headers.get("range") || undefined });
    response.headers.set("Content-Disposition", `${claims.disposition === "attachment" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(claims.filename || "file")}`);
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch (error) { return new Response(error instanceof Error ? error.message : "File unavailable", { status: error instanceof WorkspaceFileError ? error.status : 500 }); }
}
export function GET(request: Request) { return download(request, false); }
export function HEAD(request: Request) { return download(request, true); }
export async function POST(request: Request) {
  try {
    const claims = verifyWorkspaceTicket(new URL(request.url).searchParams.get("token") || "");
    if (claims.method !== "POST") return new Response("Invalid upload ticket", { status: 403 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return new Response("Missing file", { status: 400 });
    await writeWorkspaceFile(claims.userId, claims.slug, claims.workspacePath, new Uint8Array(await file.arrayBuffer()));
    return new Response(null, { status: 204 });
  } catch (error) { return new Response(error instanceof Error ? error.message : "Upload failed", { status: error instanceof WorkspaceFileError ? error.status : 500 }); }
}
