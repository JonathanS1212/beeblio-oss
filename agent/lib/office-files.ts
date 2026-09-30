import path from "node:path";

import {
  readWorkspaceFile,
  writeWorkspaceFile,
  WorkspaceFileError,
} from "../workspace-files";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";

export const MAX_OFFICE_INPUT_BYTES = 50 * 1024 * 1024;

type Context = {
  session: {
    id: string;
    auth: {
      current?: {
        principalId?: string;
        attributes?: Record<string, unknown>;
      } | null;
    };
  };
};

export function officeWorkspace(ctx: Context) {
  const auth = ctx.session.auth.current;
  const { identity } = resolveAuthenticatedWorkspace({
    principalId: auth?.principalId,
    projectSlug: auth?.attributes?.projectSlug,
    sessionId: ctx.session.id,
  });
  return { identity };
}

export async function readOfficeBytes(ctx: Context, filePath: string) {
  const { identity } = officeWorkspace(ctx);
  const workspacePath = toWorkspaceRelativePath(filePath);
  const { content } = await readWorkspaceFile(
    identity.userId,
    identity.projectSlug,
    workspacePath,
  );
  if (content.byteLength > MAX_OFFICE_INPUT_BYTES) {
    throw new Error(`Office file exceeds the ${MAX_OFFICE_INPUT_BYTES / 1024 / 1024} MiB tool limit.`);
  }
  return {
    bytes: content,
    extension: path.extname(workspacePath).toLowerCase(),
    path: `/workspace/${workspacePath}`,
  };
}

export async function writeNewOfficeFile(
  ctx: Context,
  filePath: string,
  expectedExtension: string,
  bytes: Uint8Array,
) {
  const { identity } = officeWorkspace(ctx);
  const normalizedExtension = expectedExtension.startsWith(".")
    ? expectedExtension.toLowerCase()
    : `.${expectedExtension.toLowerCase()}`;
  const workspacePath = toWorkspaceRelativePath(filePath);
  if (path.extname(workspacePath).toLowerCase() !== normalizedExtension) {
    throw new Error(`Output path must end in ${normalizedExtension}.`);
  }
  if (!["2-Data/", "3-Analysis/", "4-Reports/"].some((prefix) => workspacePath.startsWith(prefix))) {
    throw new Error("Generated Office files must be placed in 2-Data, 3-Analysis, or 4-Reports.");
  }
  try {
    await readWorkspaceFile(identity.userId, identity.projectSlug, workspacePath);
    throw new Error("The output file already exists. Choose a new versioned filename; Office generation never overwrites files.");
  } catch (error) {
    if (!(error instanceof WorkspaceFileError) || error.status !== 404) throw error;
  }
  await writeWorkspaceFile(identity.userId, identity.projectSlug, workspacePath, bytes);
  return `/workspace/${workspacePath}`;
}
