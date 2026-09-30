import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { getUser } from "@/lib/auth/session";
const execFileAsync = promisify(execFile);
export const runtime = "nodejs";
export async function POST() {
  if (!(await getUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (process.platform !== "darwin") return Response.json({ error: "Enter an absolute folder path on this computer" }, { status: 501 });
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", "POSIX path of (choose folder with prompt \"Choose a Beeblio project folder\")"], { timeout: 120000 });
    return Response.json({ folderPath: await fs.realpath(stdout.trim()) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Folder selection cancelled" }, { status: 400 }); }
}
