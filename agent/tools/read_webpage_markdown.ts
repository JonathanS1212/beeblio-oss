import { defineTool } from "eve/tools";
import { z } from "zod";
import type { ToolContext } from "eve/tools";
import { fetchWithTimeout, truncateText } from "../lib/tool-runtime";

const webpageUrl = z.url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  { message: "Only HTTP and HTTPS URLs are supported" },
);

export default defineTool({
  description:
    "Read one public webpage through defuddle.md and return its main content as truncated Markdown. Use as a lightweight fallback when web_fetch is unnecessary or unsuccessful.",
  inputSchema: z.object({
    url: webpageUrl.describe("The public HTTP or HTTPS webpage URL to read."),
  }),
  async execute({ url }, ctx: ToolContext) {
    try {
      const target = new URL(url);
      // Defuddle expects the target without its protocol:
      // https://defuddle.md/example.com/article, not .../https://example.com/article.
      const defuddleUrl = `https://defuddle.md/${target.host}${target.pathname}${target.search}`;
      const response = await fetchWithTimeout(defuddleUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BeeblioAgent/1.0)",
        },
        signal: ctx.abortSignal,
      });

      if (!response.ok) {
        throw new Error(
          `Defuddle could not read this webpage (HTTP ${response.status}). Try web_fetch for sites that block Defuddle or require browser rendering.`,
        );
      }

      const markdown = await response.text();
      return { url, ...truncateText(markdown) };
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  },
});
