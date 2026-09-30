import { defineTool } from "eve/tools";
import { loadSkill as defaultLoadSkill } from "eve/tools/load_skill";
import { z } from "zod";

import { hasHostSkill, readHostSkill } from "../lib/host-skills.ts";
import { parseSkillMarkdown, readUserSkill } from "../lib/user-skills.ts";

// Eve's built-in static-skill reader resolves skill files through the session
// sandbox. That is useful when a skill needs its packaged companion files, but
// the app can read the same skill directly from local files. Read this application's own top-level
// skill instructions from the host bundle first. The explicit map is also a
// path-traversal boundary: model-provided skill names never become paths.
/**
 * Custom `load_skill` tool that resolves user-authored skills directly from
 * local files without requiring a sandbox filesystem sync, while falling
 * back to Eve's built-in `load_skill` for static compiled skills.
 */
export default defineTool({
  description:
    "Load the full instructions for one available skill by name or id. " +
    "Use this tool when the request clearly matches a listed skill description or when the user explicitly asks for that skill. " +
    "Loading adds the skill instructions to the current turn.",
  inputSchema: z
    .object({
      skill: z.string().describe("Available skill name or id."),
    })
    .strict(),
  outputSchema: z.string(),
  async execute(input, ctx) {
    const slug = input.skill.trim().toLowerCase();
    const principalId = ctx.session.auth.current?.principalId;
    if (typeof principalId === "string" && principalId.length > 0) {
      try {
        const userSkill = await readUserSkill(principalId, slug);
        if (userSkill && !userSkill.invalidReason) {
          try {
            const parsed = parseSkillMarkdown(userSkill.markdown);
            return parsed.body.trim();
          } catch {
            return userSkill.markdown;
          }
        }
      } catch {
        // Not a user skill; fall through to built-in static skills.
      }
    }
    if (hasHostSkill(slug)) {
      const hostSkill = await readHostSkill(slug);
      if (hostSkill === null) throw new Error(`Project skill ${slug} could not be loaded`);
      return hostSkill;
    }
    return (defaultLoadSkill.execute as any)(input, ctx);
  },
});
