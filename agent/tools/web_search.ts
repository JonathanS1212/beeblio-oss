import { defineTool } from "eve/tools";
import type { ToolContext } from "eve/tools";
import { z } from "zod";
import { runTinyfish } from "../lib/monid";
import { compactModelOutput } from "../lib/tool-runtime";

const inputSchema = z
  .object({
    query: z.string().min(1),
    purpose: z.string().min(1).max(2_000).optional(),
    domainType: z.enum(["web", "news", "research_paper"]).default("web"),
    includeDomains: z.array(z.string().min(1)).max(20).optional(),
    excludeDomains: z.array(z.string().min(1)).max(20).optional(),
    recencyMinutes: z.number().int().min(1).max(5_256_000).optional(),
    afterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    beforeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.number().int().min(0).max(10).default(0),
  })
  .refine(
    (value) =>
      !(value.recencyMinutes && (value.afterDate || value.beforeDate)),
    {
      message: "recencyMinutes cannot be combined with afterDate or beforeDate",
    },
  );

export default defineTool({
  description:
    "Search the live web, news, or research papers with Monid's TinyFish search. Use it for general web research and current external information.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: ToolContext) {
    const result = await runTinyfish(
      "/search",
      {
        query: input.query,
        purpose: input.purpose,
        domain_type: input.domainType,
        include_domains: input.includeDomains?.join(","),
        exclude_domains: input.excludeDomains?.join(","),
        recency_minutes: input.recencyMinutes,
        after_date: input.afterDate,
        before_date: input.beforeDate,
        page: input.page,
      },
      { queryParams: true, signal: ctx.abortSignal },
    );

    return result;
  },
  toModelOutput(output) {
    return { type: "text" as const, value: compactModelOutput(output) };
  },
});
