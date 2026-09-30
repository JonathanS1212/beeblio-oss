import archiver from "archiver";

import { assertWorkspaceIdentity, toWorkspaceRelativePath } from "@/agent/workspace-paths";
import { AgentWorkspaceError, workspaceBucket } from "@/lib/workspace-gcs";

export async function archiveWorkspacePaths(
  userId: string,
  projectSlug: string,
  workspacePaths: string[],
  outputPath: string,
): Promise<void> {
  assertWorkspaceIdentity(userId, projectSlug);
  const inputs = workspacePaths.map(toWorkspaceRelativePath);
  const outputRelative = toWorkspaceRelativePath(outputPath);
  if (!outputRelative.startsWith(".bee-downloads/") || !outputRelative.endsWith(".zip")) {
    throw new Error("Archive output must be a ZIP under .bee-downloads");
  }
  const bucket = workspaceBucket();
  const projectPrefix = `${userId}/${projectSlug}/`;
  const outputObject = `${projectPrefix}${outputRelative}`;
  const outputFile = bucket.file(outputObject);
  const zip = archiver("zip", { zlib: { level: 6 } });
  const destination = outputFile.createWriteStream({
    resumable: true,
    metadata: { contentType: "application/zip" },
    preconditionOpts: { ifGenerationMatch: 0 },
  });

  const completed = new Promise<void>((resolve, reject) => {
    destination.once("finish", resolve);
    destination.once("error", reject);
    zip.once("error", reject);
  });
  zip.pipe(destination);

  try {
    const archivedObjects = new Set<string>();
    for (const input of inputs) {
      const objectName = `${projectPrefix}${input}`;
      const exact = bucket.file(objectName);
      const [exists] = await exact.exists();
      if (exists && !archivedObjects.has(objectName)) {
        appendObject(zip, exact, input, archivedObjects, objectName);
        continue;
      }

      const prefix = `${objectName}/`;
      const [members] = await bucket.getFiles({ prefix });
      if (members.length === 0) {
        throw new AgentWorkspaceError(
          `Workspace path was not found: ${input}`,
          404,
          "workspace_path_not_found",
        );
      }
      for (const member of members) {
        if (archivedObjects.has(member.name)) continue;
        if (member.name.endsWith("/")) {
          zip.append("", { name: member.name.slice(projectPrefix.length) });
          archivedObjects.add(member.name);
          continue;
        }
        appendObject(
          zip,
          member,
          member.name.slice(projectPrefix.length),
          archivedObjects,
          member.name,
        );
      }
    }
    await zip.finalize();
    await completed;
  } catch (error) {
    zip.abort();
    destination.destroy();
    await outputFile.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
}

function appendObject(
  zip: archiver.Archiver,
  file: ReturnType<ReturnType<typeof workspaceBucket>["file"]>,
  archivePath: string,
  archivedObjects: Set<string>,
  objectName: string,
): void {
  const source = file.createReadStream();
  source.once("error", (error) => zip.emit("error", error));
  zip.append(source, { name: archivePath });
  archivedObjects.add(objectName);
}
