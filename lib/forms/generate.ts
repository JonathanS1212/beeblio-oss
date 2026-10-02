import { matrixFieldKeys, otherFieldKey } from "./columns.ts";
import { FORM_RUNTIME_CSS, FORM_RUNTIME_JS, withFormTheme } from "./runtime.ts";
import {
  FORM_DEFINITION_SCRIPT_ID,
  FORM_MARKER_CONTENT,
  HONEYPOT_KEY,
  OTHER_VALUE,
  type FormBlock,
  type FormDefinition,
  type QuestionBlock,
} from "./schema.ts";

/**
 * Renders a form definition as one self-contained HTML document: app-styled
 * markup, the canonical definition embedded as JSON (for the builder's
 * round-trip), and the vanilla-JS runtime. This is the ONLY renderer — the
 * visual builder, the create_form agent tool, and parseFormHtml all agree
 * because they all go through here.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

// Lucide chevron paths, inlined so the runtime stays a single self-contained
// document with no external assets.
const CHEVRON_LEFT_SVG =
  '<svg class="bf-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const CHEVRON_RIGHT_SVG =
  '<svg class="bf-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

// The Beeblio mark (public/beeblio-mark.svg), inlined for the same
// self-containment reason. The nav brand links back to the app root.
const BRAND_MARK_SVG =
  '<svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">' +
  '<rect width="64" height="64" rx="17" fill="#174B72"/>' +
  '<path d="M16 17h19c8 0 13 3.9 13 10 0 3.3-1.7 5.8-4.7 7.2C47 35.7 49 38.5 49 42c0 6.5-5.4 10-14 10H16V17Z" fill="#8FCAE0" opacity=".55" transform="translate(4 -4)"/>' +
  '<path d="M16 17h19c8 0 13 3.9 13 10 0 3.3-1.7 5.8-4.7 7.2C47 35.7 49 38.5 49 42c0 6.5-5.4 10-14 10H16V17Z" fill="#E09036" opacity=".9" transform="translate(2 -2)"/>' +
  '<path d="M16 17h19c8 0 13 3.9 13 10 0 3.3-1.7 5.8-4.7 7.2C47 35.7 49 38.5 49 42c0 6.5-5.4 10-14 10H16V17Z" fill="#FCFAF6"/>' +
  '<path d="M25 24v21h9.2c3.7 0 5.8-1.5 5.8-4.3 0-2.7-2.1-4.2-5.8-4.2H29v-6h4.5c3.5 0 5.4-1.2 5.4-3.4 0-2.1-1.9-3.1-5.4-3.1H25Z" fill="#174B72"/>' +
  "</svg>";

function attributes(attributes: Record<string, string | number | undefined>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeHtml(String(value))}"`)
    .join("");
}

function questionShell(block: QuestionBlock, inner: string): string {
  // The label is a div (not <legend>): legends render inside the fieldset's
  // border area in every engine, which puts the question text on the card
  // outline. aria-labelledby keeps the fieldset's accessible group name.
  const labelId = `${block.id}-label`;
  return (
    `<fieldset class="bf-block"${attributes({ "data-block": block.id, "data-type": block.type, "data-required": block.required ? "true" : undefined, "aria-labelledby": labelId })}>` +
    `<div class="bf-label" id="${escapeHtml(labelId)}">${escapeHtml(block.label)}${block.required ? '<span class="bf-req" aria-hidden="true">*</span>' : ""}</div>` +
    (block.help ? `<p class="bf-help">${escapeHtml(block.help)}</p>` : "") +
    `<div class="bf-controls">${inner}</div>` +
    `<p class="bf-error">This question is required.</p>` +
    `</fieldset>`
  );
}

function choiceInput(
  blockId: string,
  type: "radio" | "checkbox",
  value: string,
  label: string,
): string {
  return (
    `<label class="bf-choice"><input${attributes({ type, name: blockId, value })}>` +
    `<span>${escapeHtml(label)}</span></label>`
  );
}

function otherTextWrap(blockId: string): string {
  return (
    `<div class="bf-other-text" data-other-for="${escapeHtml(blockId)}">` +
    `<input${attributes({ type: "text", name: otherFieldKey(blockId), placeholder: "Other (please specify)", autocomplete: "off" })}>` +
    `</div>`
  );
}

function renderQuestion(block: FormBlock): string {
  switch (block.type) {
    case "shortText":
      return questionShell(
        block,
        `<input${attributes({ type: "text", name: block.id, placeholder: block.placeholder, autocomplete: "off" })}>`,
      );
    case "longText":
      return questionShell(
        block,
        `<textarea${attributes({ name: block.id, placeholder: block.placeholder })}></textarea>`,
      );
    case "email":
      return questionShell(
        block,
        `<input${attributes({ type: "email", name: block.id, autocomplete: "email" })}>`,
      );
    case "number":
      return questionShell(
        block,
        `<input${attributes({ type: "number", name: block.id, min: block.min, max: block.max })}>`,
      );
    case "date":
      return questionShell(block, `<input${attributes({ type: "date", name: block.id })}>`);
    case "multipleChoice": {
      const inputs = block.options
        .map((option) => choiceInput(block.id, "radio", option, option))
        .join("");
      const other = block.otherOption
        ? choiceInput(block.id, "radio", OTHER_VALUE, "Other:") + otherTextWrap(block.id)
        : "";
      return questionShell(block, inputs + other);
    }
    case "checkboxes": {
      const inputs = block.options
        .map((option) => choiceInput(block.id, "checkbox", option, option))
        .join("");
      const other = block.otherOption
        ? choiceInput(block.id, "checkbox", OTHER_VALUE, "Other:") + otherTextWrap(block.id)
        : "";
      return questionShell(block, inputs + other);
    }
    case "dropdown": {
      const options = block.options
        .map((option) => `<option${attributes({ value: option })}>${escapeHtml(option)}</option>`)
        .join("");
      return questionShell(
        block,
        `<select${attributes({ name: block.id })}><option value="" disabled selected>Select an option</option>${options}</select>`,
      );
    }
    case "linearScale": {
      const pills: string[] = [];
      for (let value = block.scale.from; value <= block.scale.to; value++) {
        pills.push(
          `<span class="bf-pill"><input${attributes({ type: "radio", name: block.id, value })}><span>${value}</span></span>`,
        );
      }
      // Labels sit in a caption row under the pills, pinned to the ends, so a
      // long label can never wrap the scale or swap the right label to the
      // left (the pills row itself never wraps).
      const captions =
        block.scale.fromLabel || block.scale.toLabel
          ? `<div class="bf-scale-captions"><span>${escapeHtml(block.scale.fromLabel ?? "")}</span><span>${escapeHtml(block.scale.toLabel ?? "")}</span></div>`
          : "";
      return questionShell(
        block,
        `<div class="bf-scale"><div class="bf-scale-pills">${pills.join("")}</div>${captions}</div>`,
      );
    }
    case "rating": {
      const stars: string[] = [];
      for (let value = 1; value <= (block.maxStars ?? 5); value++) {
        stars.push(
          `<span class="bf-star"><input${attributes({ type: "radio", name: block.id, value })}><span aria-hidden="true">★</span></span>`,
        );
      }
      return questionShell(block, `<div class="bf-stars">${stars.join("")}</div>`);
    }
    case "matrix": {
      const keys = matrixFieldKeys(block);
      const head = block.columns
        .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
        .join("");
      const body = block.rows
        .map((row, rowIndex) => {
          const cells = block.columns
            .map(
              (column) =>
                `<td><label><input${attributes({ type: "radio", name: keys[rowIndex], value: column, "aria-label": `${row}: ${column}` })}></label></td>`,
            )
            .join("");
          return `<tr><td class="bf-matrix-row-label">${escapeHtml(row)}</td>${cells}</tr>`;
        })
        .join("");
      return questionShell(
        block,
        `<div class="bf-matrix-wrap"><table class="bf-matrix"><thead><tr><th scope="col"></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
    }
    case "statement":
      return (
        `<div class="bf-block"${attributes({ "data-block": block.id, "data-type": "statement" })}>` +
        `<h3 class="bf-section-title">${escapeHtml(block.title)}</h3>` +
        (block.body ? `<p class="bf-help">${escapeHtml(block.body)}</p>` : "") +
        `</div>`
      );
    case "section":
      // Sections never render as blocks; they split pages (see page grouping).
      return "";
  }
}

type Page = {
  header: string;
  blocks: string[];
};

/** Groups blocks into pages: content before the first section is page one. */
function buildPages(definition: FormDefinition): Page[] {
  const pages: Page[] = [
    {
      header:
        `<div class="bf-form-header"><h1>${escapeHtml(definition.title)}</h1>` +
        (definition.description ? `<p>${escapeHtml(definition.description)}</p>` : "") +
        `</div>`,
      blocks: [],
    },
  ];
  for (const block of definition.blocks) {
    if (block.type === "section") {
      pages.push({
        header:
          `<div class="bf-form-header"><h2 class="bf-section-title">${escapeHtml(block.title)}</h2>` +
          (block.description ? `<p class="bf-section-desc">${escapeHtml(block.description)}</p>` : "") +
          `</div>`,
        blocks: [],
      });
      continue;
    }
    pages[pages.length - 1].blocks.push(renderQuestion(block));
  }
  return pages;
}

export function generateFormHtml(definition: FormDefinition): string {
  const pages = buildPages(definition);
  const pageMarkup = pages
    .map((page, index) => {
      const hidden = index > 0 ? " hidden" : "";
      return `<fieldset class="bf-page" data-page="${index}"${hidden}>${page.header}${page.blocks.join("")}</fieldset>`;
    })
    .join("");
  // "<" is escaped so user text can never close the script block early; JSON
  // parsers read \u003c back as "<", keeping the definition byte-identical.
  const definitionJson = JSON.stringify(definition, null, 2).replace(/</g, "\\u003c");

  return withFormTheme(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="beeblio-form" content="${FORM_MARKER_CONTENT}">
<title>${escapeHtml(definition.title)}</title>
<style>
${FORM_RUNTIME_CSS}
</style>
</head>
<body>
<script type="application/json" id="${FORM_DEFINITION_SCRIPT_ID}">${definitionJson}</script>
<main class="bf-sheet">
<form id="beeblio-form" novalidate>
${pageMarkup}
<div class="bf-nav">
<a class="bf-brand" href="/" target="_blank" rel="noopener">${BRAND_MARK_SVG}<span>Beeblio</span></a>
<div class="bf-nav-actions">
<button type="button" class="bf-btn bf-btn-ghost" data-nav="back" hidden>${CHEVRON_LEFT_SVG}Back</button>
<button type="button" class="bf-btn bf-btn-ghost" data-nav="next"${pages.length > 1 ? "" : " hidden"}>Next${CHEVRON_RIGHT_SVG}</button>
<button type="submit" class="bf-btn bf-btn-primary" data-nav="submit">Submit</button>
</div>
</div>
<p class="bf-status" role="status" aria-live="polite"></p>
<input class="bf-hp" type="text" name="${HONEYPOT_KEY}" tabindex="-1" autocomplete="off" aria-hidden="true">
</form>
</main>
<script>
${FORM_RUNTIME_JS}
</script>
</body>
</html>
`);
}
