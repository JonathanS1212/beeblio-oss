import { defineDynamic, defineInstructions } from "eve/instructions";

import { listUserSkills, type UserSkill } from "../lib/user-skills";

/**
 * Dynamic instructions resolver for user-authored skills.
 *
 * Resolving on `turn.started` advertises all valid user skills from
 * `gs://<GCS_BUCKET>/<userId>/skills/` to the model via dynamic system
 * instructions. Because this resolver runs in-memory without Eve's
 * sandbox filesystem sync, turns that don't invoke sandbox tools
 * (like a simple "Hello") execute without booting the Blaxel microVM.
 */
export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const principalId = ctx.session.auth.current?.principalId;
      if (typeof principalId !== "string" || principalId === "") return null;

      const skills: UserSkill[] = await listUserSkills(principalId).catch(
        (error) => {
          console.warn("[instructions:user-skills] failed to resolve user skills", error);
          return [];
        },
      );
      const valid = skills.filter((skill) => !skill.invalidReason);
      if (valid.length === 0) return null;

      const lines = [
        "User-defined skills:",
        "The following user-authored skills are available for this user. If the user names one of these skills or the request clearly matches its description, call `load_skill` with that skill name to load its instructions:",
        ...valid.map((skill) => `- \`${skill.slug}\`: ${skill.description}`),
      ];

      return defineInstructions({
        content: lines.join("\n"),
        role: "system",
      });
    },
  },
});
