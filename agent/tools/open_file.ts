import path from "node:path";

import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Open a workspace file in the user's preview panel and activate its tab. Use after creating or finding a file that the user should see. This changes only the UI; use read_file when you need the file's contents.",
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        "The file path relative to /workspace, or an absolute path beginning with /workspace/.",
      ),
  }),
  execute({ path: inputPath }) {
    // Accept "/workspace/foo" and the missing-slash "workspace/foo" form;
    // "./workspace/..." is left intact so a real folder of that name works.
    const relativePath = inputPath.replace(/^\/?workspace\//, "");
    const normalizedPath = path.posix.normalize(relativePath).replace(/^\.\//, "");

    if (
      normalizedPath === "." ||
      normalizedPath === ".." ||
      normalizedPath.startsWith("../") ||
      normalizedPath.startsWith("/")
    ) {
      throw new Error("The file must be inside /workspace.");
    }

    return {
      action: "open_file" as const,
      path: normalizedPath,
      name: path.posix.basename(normalizedPath),
    };
  },
});
