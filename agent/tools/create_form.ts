import { defineTool } from "eve/tools";
import { z } from "zod";

import { generateFormHtml } from "../../lib/forms/generate.ts";
import { FORMS_DIRECTORY, parseFormDefinition } from "../../lib/forms/schema.ts";
import {
  resolveAuthenticatedWorkspace,
} from "../workspace-paths";
import { readWorkspaceFile, writeWorkspaceFile, WorkspaceFileError } from "../workspace-files";

/**
 * Creates or replaces a Beeblio survey form (*.form.html) from a JSON
 * definition instead of hand-written HTML, mirroring how update_matrix owns
 * .matrix files. The generator (lib/forms/generate.ts) is shared with the web
 * builder, so agent- and builder-authored forms are interchangeable and the
 * builder can round-trip anything this tool writes.
 */

const createFormInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300).describe("Form title shown at the top of the form."),
    description: z
      .string()
      .trim()
      .max(4_000)
      .optional()
      .describe("Optional intro text under the title."),
    confirmationMessage: z
      .string()
      .trim()
      .max(2_000)
      .optional()
      .describe("Message shown after a respondent submits. Defaults to a standard thank-you."),
    blocks: z
      .array(
        z.object({
          type: z
            .enum([
              "shortText",
              "longText",
              "email",
              "number",
              "date",
              "multipleChoice",
              "checkboxes",
              "dropdown",
              "linearScale",
              "rating",
              "matrix",
              "section",
              "statement",
            ])
            .describe(
              "Question type, or `section` (page break with title/description) / `statement` (display-only title/body).",
            ),
          label: z
            .string()
            .trim()
            .max(2_000)
            .optional()
            .describe("Question text. Required for every type except section and statement."),
          title: z
            .string()
            .trim()
            .max(2_000)
            .optional()
            .describe("Heading text. Required for section and statement blocks."),
          body: z.string().trim().max(4_000).optional().describe("Body text of a statement block."),
          description: z
            .string()
            .trim()
            .max(4_000)
            .optional()
            .describe("Description under a section heading."),
          help: z.string().trim().max(2_000).optional().describe("Helper text under the question."),
          placeholder: z.string().trim().max(300).optional().describe("Placeholder for shortText/longText."),
          required: z.boolean().optional().describe("Whether an answer is required. Default false."),
          options: z
            .array(z.string().trim().min(1).max(500))
            .max(100)
            .optional()
            .describe("Answer options for multipleChoice, checkboxes, and dropdown."),
          otherOption: z
            .boolean()
            .optional()
            .describe("Add an 'Other…' free-text choice (multipleChoice, checkboxes)."),
          min: z.number().optional().describe("Minimum for number questions."),
          max: z.number().optional().describe("Maximum for number questions."),
          scale: z
            .object({
              from: z.number().int().min(0).max(1).optional(),
              to: z.number().int().min(2).max(10).optional(),
              fromLabel: z.string().trim().max(200).optional(),
              toLabel: z.string().trim().max(200).optional(),
            })
            .optional()
            .describe("Linear scale range, default 1–5, e.g. {from:1,to:7,fromLabel:'Strongly Disagree',toLabel:'Strongly Agree'}."),
          maxStars: z.number().int().min(3).max(10).optional().describe("Stars for rating blocks, default 5."),
          rows: z.array(z.string().trim().min(1).max(500)).max(50).optional().describe("Grid row labels (matrix)."),
          columns: z.array(z.string().trim().min(1).max(200)).max(10).optional().describe("Grid column choices (matrix)."),
        }),
      )
      .min(1)
      .max(200)
      .describe("Ordered form content. Block ids are derived automatically from labels."),
    path: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .optional()
      .describe(
        `Destination ending in .form.html under ${FORMS_DIRECTORY}, relative to /workspace (e.g. ${FORMS_DIRECTORY}/survey.form.html or /workspace/${FORMS_DIRECTORY}/survey.form.html). Defaults to a slugified title there.`,
      ),
  })
  .strict();

function slugifyFileName(text: string): string {
  const slug = text
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "form";
}

export default defineTool({
  description:
    "Create or replace a survey/questionnaire form file (*.form.html) inside /workspace from a JSON definition — " +
    "never write these files with write_file. The form is a self-contained HTML page the user can share publicly; " +
    "respondents' answers are saved to a sibling <name>.responses.csv automatically. " +
    "To edit an existing form, read it first (read_file), adjust the definition, and call create_form again with the same path.",
  inputSchema: createFormInputSchema,
  async execute({ title, description, confirmationMessage, blocks, path: inputPath }, ctx) {
    const definition = parseFormDefinition({
      version: 1,
      title,
      ...(description ? { description } : {}),
      settings: confirmationMessage ? { confirmationMessage } : undefined,
      blocks,
    });

    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });

    // Accept the /workspace-prefixed forms the model is coached to prefer;
    // "./workspace/..." stays untouched so a real folder of that name still
    // resolves.
    const relativePath = (
      inputPath ?? `${FORMS_DIRECTORY}/${slugifyFileName(title)}.form.html`
    ).replace(/^\/?workspace\//, "");
    if (!relativePath.endsWith(".form.html")) {
      throw new Error("The form path must end in .form.html");
    }
    if (relativePath.startsWith("/") || relativePath.startsWith("..")) {
      throw new Error("The form path must be inside /workspace");
    }
    if (!relativePath.startsWith(`${FORMS_DIRECTORY}/`)) {
      throw new Error(`Forms live in /workspace/${FORMS_DIRECTORY} so they appear in the Forms panel; keep the path inside that folder.`);
    }

    let replaced = false;
    try {
      await readWorkspaceFile(identity.userId, identity.projectSlug, relativePath);
      replaced = true;
    } catch (error) {
      if (!(error instanceof WorkspaceFileError) || error.status !== 404) {
        throw error;
      }
    }

    const html = generateFormHtml(definition);
    await writeWorkspaceFile(identity.userId, identity.projectSlug, relativePath, Buffer.from(html, "utf8"), {
      contentType: "text/html",
    });

    const questionCount = definition.blocks.filter(
      (block) => block.type !== "section" && block.type !== "statement",
    ).length;

    return {
      path: `/workspace/${relativePath}`,
      created: !replaced,
      questionCount,
      blockCount: definition.blocks.length,
      note:
        "The user can open this file to edit it visually or share it publicly (Share button). " +
        "Submissions append to " +
        relativePath.replace(/\.form\.html$/, ".responses.csv") +
        " once the form is shared.",
    };
  },
});
