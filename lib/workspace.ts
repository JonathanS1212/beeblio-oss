import path from "node:path";

/**
 * Resolve a project-relative path (may include subdirectories) and guarantee the
 * result stays inside the project dir. Leading slashes are treated as relative
 * to the project root; `..` traversal that would escape is rejected.
 *
 * Shared by the file server actions and the workspace byte-serving route so the
 * traversal guard is identical everywhere.
 */
export function resolveWithin(dir: string, rel: string): string {
  const cleaned = (rel ?? "").trim().replace(/^\/+/, "");
  if (cleaned === "" || cleaned === ".") return dir;
  const target = path.resolve(dir, cleaned);
  if (target !== dir && !target.startsWith(dir + path.sep)) {
    throw new Error("path escapes the project directory");
  }
  return target;
}
