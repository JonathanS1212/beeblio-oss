import archiver from "archiver";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { assertWorkspaceIdentity, toWorkspaceRelativePath } from "@/agent/workspace-paths";
import { AgentWorkspaceError, projectFolder } from "@/lib/workspace-files";
export async function archiveWorkspacePaths(userId: string, projectSlug: string, workspacePaths: string[], outputPath: string): Promise<void> {
  assertWorkspaceIdentity(userId, projectSlug);
  const root = await projectFolder(userId, projectSlug);
  const outputRelative = toWorkspaceRelativePath(outputPath);
  if (!outputRelative.startsWith(".bee-downloads/") || !outputRelative.endsWith(".zip")) throw new Error("Archive output must be a ZIP under .bee-downloads");
  const output = path.join(root, outputRelative);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const zip = archiver("zip", { zlib: { level: 6 } });
  const destination = createWriteStream(output, { flags: "wx" });
  const completed = new Promise<void>((resolve, reject) => { destination.once("finish", resolve); destination.once("error", reject); zip.once("error", reject); });
  zip.pipe(destination);
  try {
    for (const input of workspacePaths.map(toWorkspaceRelativePath)) {
      const absolute = path.join(root, input);
      const real = await fs.realpath(absolute).catch(() => { throw new AgentWorkspaceError(`Workspace path was not found: ${input}`, 404, "workspace_path_not_found"); });
      if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new AgentWorkspaceError("Path escapes project folder", 400, "invalid_workspace_path");
      const stat = await fs.stat(real);
      if (stat.isDirectory()) zip.directory(real, input);
      else zip.file(real, { name: input });
    }
    await zip.finalize(); await completed;
  } catch (error) { zip.abort(); destination.destroy(); await fs.rm(output, { force: true }); throw error; }
}
