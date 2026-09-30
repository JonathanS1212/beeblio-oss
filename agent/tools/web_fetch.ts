import { defineTool } from "eve/tools";
import type { ToolContext } from "eve/tools";
import { z } from "zod";
import { runTinyfish } from "../lib/monid";
import { compactModelOutput } from "../lib/tool-runtime";

const webUrl = z.url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  { message: "Only HTTP and HTTPS URLs are supported" },
);

const inputSchema = z.object({
  urls: z.array(webUrl).min(1).max(10),
  purpose: z.string().min(1).max(2_000).optional(),
  format: z.enum(["markdown", "html", "json"]).default("markdown"),
  links: z.boolean().default(false),
  imageLinks: z.boolean().default(false),
  live: z.boolean().default(false),
  timeoutMs: z.number().int().min(1).max(110_000).default(30_000),
});

export default defineTool({
  description:
    "Fetch one to ten public web pages through Monid's TinyFish browser and return clean Markdown, HTML, or structured JSON. Use web_search first when the URL is unknown.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: ToolContext) {
    const result = await runTinyfish(
      "/fetch",
      {
        urls: input.urls,
        purpose: input.purpose,
        format: input.format,
        links: input.links,
        image_links: input.imageLinks,
        ...(input.live ? { ttl: 0 } : {}),
        per_url_timeout_ms: input.timeoutMs,
      },
      { signal: ctx.abortSignal },
    );

    return result;
  },
  toModelOutput(output) {
    return { type: "text" as const, value: compactModelOutput(output) };
  },
});
