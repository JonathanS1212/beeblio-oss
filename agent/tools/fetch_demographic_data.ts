import { defineTool } from "eve/tools";
import { z } from "zod";
import type { ToolContext } from "eve/tools";
import { fetchWithTimeout } from "../lib/tool-runtime";
import { resolveWorkspaceOutputFile } from "../workspace-paths";
import { writeWorkspaceFile } from "../workspace-files";

const inputSchema = z
  .object({
    countryCode: z.string().trim().regex(/^[A-Za-z]{2,3}(?:;[A-Za-z]{2,3})*$/),
    indicator: z.string().trim().regex(/^[A-Za-z0-9.]{2,40}$/),
    startYear: z.number().int().min(1800).max(2200).optional(),
    endYear: z.number().int().min(1800).max(2200).optional(),
    perPage: z.number().int().min(1).max(1000).default(200),
    destinationPath: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Workspace file path for the records as a JSON array, e.g. /workspace/2-Data/worldbank-gdp-idn.json. " +
          "Overwrites the file if it exists.",
      ),
  })
  .refine((value) => !value.startYear || !value.endYear || value.startYear <= value.endYear, {
    message: "startYear must be less than or equal to endYear",
  });

export default defineTool({
  description:
    "Fetch demographic or economic indicators from the World Bank API and write them to a workspace JSON file; " +
    "returns only the record count and query metadata. Analyze the file natively with a saved Python script instead of pasting records into chat.",
  inputSchema,
  async execute({ countryCode, indicator, startYear, endYear, perPage, destinationPath }, ctx: ToolContext) {
      let url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?format=json`;
      if (startYear && endYear) {
         url += `&date=${startYear}:${endYear}`;
      } else if (startYear) {
         url += `&date=${startYear}`;
      }
      const baseUrl = `${url}&per_page=${perPage}`;
      const response = await fetchWithTimeout(`${baseUrl}&page=1`, { signal: ctx.abortSignal });
      if (!response.ok) {
        throw new Error(`World Bank API responded with status: ${response.status}`);
      }
      const data = await response.json() as [Record<string, unknown>, unknown[]] | { message?: Array<{ value?: string }> };
      if (!Array.isArray(data) || !Array.isArray(data[1])) {
        const message = !Array.isArray(data) && Array.isArray(data.message)
          ? data.message.map((item) => item.value).join("; ")
          : "World Bank returned an invalid response";
        throw new Error(message);
      }
      const metadata = data[0];
      const pageCount = Number(metadata.pages ?? 1);
      const pagesToFetch = Math.min(pageCount, 10);
      const records = [...data[1]];
      for (let page = 2; page <= pagesToFetch && records.length < 5_000; page++) {
        const nextResponse = await fetchWithTimeout(`${baseUrl}&page=${page}`, { signal: ctx.abortSignal });
        if (!nextResponse.ok) throw new Error(`World Bank API page ${page} responded with status: ${nextResponse.status}`);
        const nextData = await nextResponse.json() as [Record<string, unknown>, unknown[]];
        if (!Array.isArray(nextData) || !Array.isArray(nextData[1])) throw new Error(`World Bank API page ${page} returned an invalid response`);
        records.push(...nextData[1]);
      }
      const truncated = pageCount > pagesToFetch || records.length > 5_000;
      const kept = records.slice(0, 5_000);

      const destination = resolveWorkspaceOutputFile(
        {
          principalId: ctx.session.auth.current?.principalId,
          projectSlug: ctx.session.auth.current?.attributes?.projectSlug,
          sessionId: ctx.session.id,
        },
        destinationPath,
      );
      await writeWorkspaceFile(
        destination.userId,
        destination.projectSlug,
        destination.workspacePath,
        Buffer.from(JSON.stringify(kept, null, 2) + "\n", "utf8"),
        { contentType: "application/json" },
      );

      return {
        success: true,
        path: `/workspace/${destination.workspacePath}`,
        recordCount: kept.length,
        indicator,
        countryCode,
        startYear: startYear ?? null,
        endYear: endYear ?? null,
        totalAvailable: Number(metadata.total ?? kept.length),
        truncated,
        message: `Wrote ${kept.length} records to /workspace/${destination.workspacePath}` + (truncated ? " (result capped at 5,000 records)" : ""),
      };
  },
});
