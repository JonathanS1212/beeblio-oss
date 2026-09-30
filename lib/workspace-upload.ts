import type { WorkspaceFileEntry } from "./workspace-files";

type UploadTicket = {
  uploadUrl: string;
  uploadMethod: "POST";
  fields: Record<string, string>;
  contentType: string;
  file: WorkspaceFileEntry;
};

export type WorkspaceUploadResult =
  | { success: true; file: WorkspaceFileEntry }
  | { success: false; error: string };

async function confirmWorkspaceUpload(
  projectId: string,
  file: WorkspaceFileEntry,
): Promise<boolean> {
  const response = await fetch("/api/workspace/upload-confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, path: file.path, sizeBytes: file.size }),
  });
  if (!response.ok) return false;
  const body = await response.json().catch(() => ({})) as { uploaded?: unknown };
  return body.uploaded === true;
}

export async function uploadWorkspaceFile(
  projectId: string,
  subpath: string,
  file: File,
  options?: { overwrite?: boolean },
): Promise<WorkspaceUploadResult> {
  try {
    const ticketResponse = await fetch("/api/workspace/upload-ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        subpath,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        overwrite: options?.overwrite === true,
      }),
    });
    const ticketBody = await ticketResponse.json().catch(() => ({})) as Partial<UploadTicket> & { error?: string };
    if (!ticketResponse.ok || !ticketBody.uploadUrl || !ticketBody.file || !ticketBody.contentType || !ticketBody.fields) {
      return { success: false, error: ticketBody.error || "Unable to prepare file upload" };
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(ticketBody.fields)) form.append(name, value);
    form.append("file", file);
    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(ticketBody.uploadUrl, {
        method: "POST",
        body: form,
      });
    } catch (uploadError) {
      // GCS can accept the signed POST but withhold its response from the
      // browser when an origin is absent from bucket CORS. Confirm the exact
      // object through our authenticated origin before reporting a failure.
      if (await confirmWorkspaceUpload(projectId, ticketBody.file).catch(() => false)) {
        return { success: true, file: ticketBody.file };
      }
      throw uploadError;
    }
    if (!uploadResponse.ok) {
      return { success: false, error: `Storage upload failed with status ${uploadResponse.status}` };
    }
    return { success: true, file: ticketBody.file };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
