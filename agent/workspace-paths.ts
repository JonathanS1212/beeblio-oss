import { createHash } from "node:crypto";

/**
 * Workspace identity + path resolution for the Blaxel/GCS architecture.
 * Durable files live at gs://<GCS_BUCKET>/<userId>/<projectSlug>/...; there
 * is no host directory anymore, so this module only validates identity and
 * maps model-supplied paths to workspace-relative object paths.
 */

const workspaceComponentPattern = /^[A-Za-z0-9_-]+$/;

export type WorkspaceIdentityInput = {
  principalId: unknown;
  projectSlug: unknown;
  sessionId: string;
};

export type WorkspaceIdentity = {
  projectSlug: string;
  userId: string;
  usedLocalFallback: boolean;
};

export function isValidWorkspaceComponent(value: string): boolean {
  return workspaceComponentPattern.test(value);
}

export function assertWorkspaceIdentity(
  userId: string,
  projectSlug: string,
): void {
  if (!workspaceComponentPattern.test(userId)) {
    throw new Error("Invalid workspace user id");
  }
  if (!workspaceComponentPattern.test(projectSlug)) {
    throw new Error("Invalid workspace project slug");
  }
}

export function getWorkspaceIdentity({
  principalId,
  projectSlug,
  sessionId,
}: WorkspaceIdentityInput): WorkspaceIdentity {
  if (
    typeof principalId === "string" &&
    typeof projectSlug === "string" &&
    workspaceComponentPattern.test(principalId) &&
    workspaceComponentPattern.test(projectSlug)
  ) {
    return {
      userId: principalId,
      projectSlug,
      usedLocalFallback: false,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Authenticated project workspace is required");
  }

  return {
    userId: "local-dev",
    projectSlug: `session-${createHash("sha256")
      .update(sessionId)
      .digest("hex")
      .slice(0, 16)}`,
    usedLocalFallback: true,
  };
}

export function resolveAuthenticatedWorkspace(
  input: WorkspaceIdentityInput,
): { identity: WorkspaceIdentity } {
  return { identity: getWorkspaceIdentity(input) };
}

/**
 * Normalize a model-supplied workspace path to its canonical relative form
 * ("3-Analysis/chart.png"). Accepts an optional /workspace prefix (and a
 * bare "workspace/" prefix) while keeping "./workspace/..." untouched so a
 * real folder of that name stays reachable. Rejects traversal, absolute
 * paths outside /workspace, and the workspace root.
 */
export function toWorkspaceRelativePath(workspacePath: string): string {
  if (workspacePath.includes("\0")) {
    throw new Error("Workspace path contains an invalid null byte");
  }
  let candidate = workspacePath.trim();
  if (candidate.startsWith("workspace/") && !candidate.startsWith("./")) {
    candidate = candidate.slice("workspace/".length);
  }
  if (candidate === "/workspace" || candidate === "/workspace/") {
    throw new Error("Destination must be a path inside /workspace, not the workspace root");
  }
  if (candidate.startsWith("/workspace/")) {
    candidate = candidate.slice("/workspace/".length);
  } else if (candidate.startsWith("/")) {
    throw new Error("Path must be inside /workspace");
  }
  const segments = candidate.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error(`Invalid workspace path: "${workspacePath}"`);
    }
  }
  return segments.join("/");
}

/**
 * Resolve a model-supplied destination inside the authenticated project
 * workspace for tools that write artifacts via the shared GCS file layer,
 * so bulk data never transits model context.
 */
export function resolveWorkspaceOutputFile(
  identity: WorkspaceIdentityInput,
  destinationPath: string,
): { userId: string; projectSlug: string; workspacePath: string } {
  const resolved = resolveAuthenticatedWorkspace(identity).identity;
  return {
    userId: resolved.userId,
    projectSlug: resolved.projectSlug,
    workspacePath: toWorkspaceRelativePath(destinationPath),
  };
}
