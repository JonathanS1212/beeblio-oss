// Recent membership answers and confirmed writes, scoped to a project. The
// picker reads these synchronously so its badge never queues a Server Action
// ahead of the user's write.
const pathsByProject = new Map<string, Map<string, string[]>>();
const recentCommits = new Map<string, Map<string, { path: string; at: number }>>();
const COMMIT_TTL_MS = 30_000;

export function clearMatrixMembership(projectId: string) {
  pathsByProject.delete(projectId);
  recentCommits.delete(projectId);
}

function projectEntries(projectId: string) {
  let entries = pathsByProject.get(projectId);
  if (!entries) {
    entries = new Map();
    pathsByProject.set(projectId, entries);
  }
  return entries;
}

export function rememberLiteratureMatrixPaths(projectId: string, paths: Record<string, string[]>) {
  const entries = projectEntries(projectId);
  const commits = recentCommits.get(projectId);
  for (const [id, matrixPaths] of Object.entries(paths)) {
    const recent = commits?.get(`literature:${id}`);
    entries.set(`literature:${id}`, recent && Date.now() - recent.at < COMMIT_TTL_MS
      ? [...new Set([...matrixPaths, recent.path])]
      : matrixPaths);
  }
}

export function rememberCitationMatrixPaths(projectId: string, paths: Record<string, string[]>) {
  const entries = projectEntries(projectId);
  const commits = recentCommits.get(projectId);
  for (const [id, matrixPaths] of Object.entries(paths)) {
    const recent = commits?.get(`citations:${id}`);
    entries.set(`citations:${id}`, recent && Date.now() - recent.at < COMMIT_TTL_MS
      ? [...new Set([...matrixPaths, recent.path])]
      : matrixPaths);
  }
}

export function matrixPathsForRequest(projectId: string, kind: "literature" | "citations" | "pdf", ids: string[]) {
  const entries = pathsByProject.get(projectId);
  if (!entries || ids.some((id) => !entries.has(`${kind}:${id}`))) return undefined;
  const paths = ids.map((id) => entries.get(`${kind}:${id}`) ?? []);
  return paths[0].filter((path) => paths.every((candidate) => candidate.includes(path)));
}

export function rememberMatrixCommit(projectId: string, kind: "literature" | "citations" | "pdf", ids: string[], matrixPath: string) {
  const entries = projectEntries(projectId);
  let commits = recentCommits.get(projectId);
  if (!commits) {
    commits = new Map();
    recentCommits.set(projectId, commits);
  }
  for (const id of ids) {
    const key = `${kind}:${id}`;
    entries.set(key, [...new Set([...(entries.get(key) ?? []), matrixPath])]);
    commits.set(key, { path: matrixPath, at: Date.now() });
  }
}
