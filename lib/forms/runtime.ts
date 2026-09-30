/**
 * The self-contained runtime embedded into every generated form HTML: app
 * styling (the workspace light/dark palettes as plain values, since the file
 * must render standalone) plus a small vanilla-JS driver that handles section
 * paging, required-question validation, the "Other" option, star ratings, and
 * submission to the public endpoint.
 *
 * Constraints to preserve when editing:
 * - No imports, no external assets: respondents get one HTML file.
 * - The script text must never contain the literal "</script" sequence.
 * - Field names must match lib/forms/columns.ts exactly.
 */

export const FORM_RUNTIME_CSS = `
:root {
  color-scheme: light dark;
  --bf-bg: oklch(0.975 0.008 88);
  --bf-fg: oklch(0.235 0.02 250);
  --bf-card: oklch(0.995 0.004 88);
  --bf-primary: oklch(0.4 0.085 245);
  --bf-primary-fg: oklch(0.985 0.006 88);
  --bf-muted: oklch(0.52 0.026 240);
  --bf-border: oklch(0.882 0.017 91);
  --bf-input: oklch(0.875 0.018 91);
  --bf-ring: oklch(0.58 0.1 245);
  --bf-accent: oklch(0.92 0.035 235);
  --bf-destructive: oklch(0.577 0.245 27.325);
  --bf-radius: 0.75rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bf-bg: oklch(0.17 0.014 250);
    --bf-fg: oklch(0.94 0.01 92);
    --bf-card: oklch(0.205 0.016 250);
    --bf-primary: oklch(0.72 0.09 240);
    --bf-primary-fg: oklch(0.17 0.02 250);
    --bf-muted: oklch(0.69 0.025 240);
    --bf-border: oklch(0.42 0.02 245 / 45%);
    --bf-input: oklch(0.45 0.025 245 / 55%);
    --bf-ring: oklch(0.68 0.09 240);
    --bf-accent: oklch(0.29 0.035 240);
    --bf-destructive: oklch(0.704 0.191 22.216);
  }
  .bf-form-header, .bf-block { box-shadow: 0 1px 2px rgb(0 0 0 / 0.25); }
  input[type="text"], input[type="email"], input[type="number"], input[type="date"], textarea, select {
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
  }
  select {
    background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23a6adbd'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E");
  }
}
* { box-sizing: border-box; }
/* Class display rules (.bf-btn, …) would otherwise outrank the UA's
   [hidden] rule and keep "hidden" Back/Next buttons visible. */
[hidden] { display: none !important; }
html { height: 100%; }
body {
  margin: 0;
  min-height: 100%;
  /* Cream base with a soft brand-tinted wash at the top, like the app shell. */
  background-color: var(--bf-bg);
  background-image: linear-gradient(180deg, color-mix(in oklab, var(--bf-accent) 16%, var(--bf-bg)), var(--bf-bg) 340px);
  background-repeat: no-repeat;
  color: var(--bf-fg);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.bf-sheet { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
/* Cards round proportionally more than the inputs inside them (16px vs 12px)
   so both read with the same softness. */
.bf-form-header, .bf-block {
  background: var(--bf-card);
  border: 1px solid var(--bf-border);
  border-radius: calc(var(--bf-radius) + 4px);
  padding: 22px 24px;
  box-shadow: 0 1px 2px rgb(18 35 48 / 0.05), 0 1px 3px rgb(18 35 48 / 0.04);
}
.bf-form-header { margin-bottom: 14px; }
.bf-form-header h1 { margin: 0 0 6px; font-size: 1.45rem; line-height: 1.3; letter-spacing: -0.01em; }
.bf-form-header p, .bf-section-desc { margin: 0; color: var(--bf-muted); white-space: pre-line; }
.bf-section-title { margin: 0 0 6px; font-size: 1.15rem; }
.bf-block { margin: 14px 0 0; min-width: 0; transition: border-color 0.15s, box-shadow 0.15s; }
/* The card being answered gets a soft primary halo, like the app's focus ring. */
.bf-block:focus-within {
  border-color: color-mix(in oklab, var(--bf-primary) 65%, transparent);
  box-shadow: 0 1px 2px rgb(18 35 48 / 0.05), 0 1px 3px rgb(18 35 48 / 0.04), 0 0 0 3px color-mix(in oklab, var(--bf-primary) 25%, transparent);
}
.bf-block.bf-invalid { border-color: var(--bf-destructive); }
.bf-label { display: block; margin: 0 0 4px; font-weight: 600; font-size: 0.98rem; }
.bf-req { color: var(--bf-destructive); margin-left: 2px; }
.bf-help { margin: 0 0 10px; color: var(--bf-muted); font-size: 0.85rem; white-space: pre-line; }
.bf-controls { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; min-width: 0; }
.bf-choice { display: flex; align-items: flex-start; gap: 10px; padding: 7px 10px; margin: 1px -10px; border-radius: calc(var(--bf-radius) - 4px); cursor: pointer; transition: background-color 0.12s; }
.bf-choice:hover { background: color-mix(in oklab, var(--bf-accent) 45%, transparent); }
/* A chosen option keeps a tinted row so selections stay visible while scrolling. */
.bf-choice:has(input:checked) { background: color-mix(in oklab, var(--bf-accent) 60%, transparent); }
.bf-choice:has(input:checked) span { font-weight: 500; }
.bf-choice input { accent-color: var(--bf-primary); width: 16px; height: 16px; flex: none; margin: 3px 0 0; }
.bf-choice span { overflow-wrap: anywhere; }
.bf-other-text { display: none; margin: 4px 0 2px 16px; width: calc(100% - 16px); }
.bf-other-text input { width: 100%; }
fieldset.bf-page { border: 0; padding: 0; margin: 0; min-width: 0; }
/* Answer fields mirror the app's Input: generous rounding, translucent card
   fill, an inset top highlight, soft hover border, and a 3px focus ring. */
input[type="text"], input[type="email"], input[type="number"], input[type="date"], textarea, select {
  width: 100%;
  padding: 9px 14px;
  border: 1px solid var(--bf-input);
  border-radius: var(--bf-radius);
  background: color-mix(in oklab, var(--bf-card) 75%, transparent);
  color: inherit;
  font: inherit;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.35), 0 1px 2px rgb(18 35 48 / 0.04);
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}
input:hover, textarea:hover, select:hover { border-color: color-mix(in oklab, var(--bf-primary) 25%, transparent); }
input::placeholder, textarea::placeholder { color: color-mix(in oklab, var(--bf-muted) 75%, transparent); }
input[type="date"] { color-scheme: inherit; }
input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: none;
  border-color: var(--bf-ring);
  background: var(--bf-card);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--bf-ring) 15%, transparent);
}
textarea { min-height: 110px; resize: vertical; }
/* Custom chevron so its spacing from the right edge matches the text on the
   left (the UA arrow hugs the border). */
select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 2.9em;
  background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%236b7484'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.95em center;
  background-size: 15px;
}
.bf-scale { margin-top: 4px; display: flex; flex-direction: column; align-items: center; }
.bf-scale-pills { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow-x: auto; max-width: 100%; padding-bottom: 2px; }
.bf-scale-captions { display: flex; justify-content: space-between; gap: 12px; margin-top: 3px; align-self: stretch; }
.bf-scale-captions span { color: var(--bf-muted); font-size: 0.82rem; line-height: 1.35; max-width: 45%; }
.bf-scale-captions span:last-child { text-align: right; }
.bf-pill { position: relative; }
.bf-pill input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.bf-pill span {
  display: flex; align-items: center; justify-content: center;
  min-width: 40px; padding: 8px 10px;
  border: 1px solid var(--bf-border);
  border-radius: calc(var(--bf-radius) - 4px);
  cursor: pointer; font-size: 0.9rem;
  transition: border-color 0.15s, background-color 0.15s;
}
.bf-pill input:hover + span { border-color: color-mix(in oklab, var(--bf-primary) 35%, transparent); }
.bf-pill input:focus-visible + span { outline: none; border-color: var(--bf-ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--bf-ring) 15%, transparent); }
.bf-pill input:checked + span { background: var(--bf-primary); border-color: var(--bf-primary); color: var(--bf-primary-fg); font-weight: 600; }
/* Stars fill left → right in DOM order; the runtime paints 1..N from the left. */
.bf-stars { display: flex; gap: 4px; }
.bf-star { position: relative; }
.bf-star input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.bf-star span { font-size: 26px; line-height: 1; cursor: pointer; color: var(--bf-border); transition: color 0.1s; display: block; padding: 2px; }
.bf-star input:checked ~ span, .bf-star.bf-on span { color: oklch(0.76 0.14 75); }
.bf-star input:focus-visible ~ span { outline: 2px solid var(--bf-ring); outline-offset: 1px; border-radius: 4px; }.bf-matrix-wrap { overflow-x: auto; margin-top: 4px; }
table.bf-matrix { border-collapse: collapse; width: 100%; min-width: 480px; }
.bf-matrix th, .bf-matrix td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--bf-border); font-weight: 400; vertical-align: top; }
.bf-matrix thead th { color: var(--bf-muted); font-size: 0.82rem; }
/* Center each column header over its radio ticks so they read as one column. */
.bf-matrix thead th:not(:first-child) { text-align: center; }
.bf-matrix td.bf-matrix-row-label { font-weight: 500; overflow-wrap: anywhere; }
.bf-matrix label { display: flex; justify-content: center; }
.bf-matrix input[type="radio"] { accent-color: var(--bf-primary); width: 16px; height: 16px; }
.bf-error { display: none; margin: 8px 0 0; color: var(--bf-destructive); font-size: 0.83rem; }
.bf-invalid .bf-error { display: block; }
.bf-nav { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.bf-nav-actions { display: flex; justify-content: flex-end; gap: 10px; margin-left: auto; }
.bf-brand {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: calc(var(--bf-radius) - 4px);
  color: var(--bf-muted); text-decoration: none;
  font-size: 0.95rem; font-weight: 600; letter-spacing: -0.01em;
}
.bf-brand:hover { background: color-mix(in oklab, var(--bf-accent) 40%, transparent); color: var(--bf-fg); }
.bf-brand:focus-visible { outline: 2px solid var(--bf-ring); outline-offset: 2px; }
.bf-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 20px; border-radius: var(--bf-radius);
  font: inherit; font-weight: 600; cursor: pointer; border: 1px solid transparent;
  transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.bf-chev { flex: none; }
.bf-btn-primary { background: var(--bf-primary); color: var(--bf-primary-fg); box-shadow: 0 8px 20px -12px var(--bf-primary); }
.bf-btn-primary:hover { background: color-mix(in oklab, var(--bf-primary) 92%, transparent); transform: translateY(-1px); box-shadow: 0 12px 24px -13px var(--bf-primary); }
.bf-btn-primary:disabled { opacity: 0.6; cursor: default; }
.bf-btn-ghost { background: color-mix(in oklab, var(--bf-card) 80%, transparent); color: var(--bf-fg); border-color: var(--bf-border); }
.bf-btn-ghost:hover { background: color-mix(in oklab, var(--bf-accent) 55%, transparent); transform: translateY(-1px); }
.bf-btn:active { transform: translateY(1px); }
.bf-btn:focus-visible { outline: none; border-color: var(--bf-ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--bf-ring) 20%, transparent); }
.bf-status { margin: 14px 0 0; padding: 12px 16px; border-radius: var(--bf-radius); display: none; font-size: 0.92rem; }
.bf-status.bf-show { display: block; }
.bf-status-error { background: color-mix(in oklab, var(--bf-destructive) 12%, transparent); color: var(--bf-destructive); }
.bf-confirmation { text-align: center; padding: 56px 24px; }
.bf-confirmation .bf-check {
  width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%;
  background: color-mix(in oklab, var(--bf-primary) 14%, transparent);
  color: var(--bf-primary); font-size: 26px; line-height: 52px; font-weight: 700;
}
.bf-confirmation h2 { margin: 0 0 6px; font-size: 1.2rem; }
.bf-confirmation p { margin: 0; color: var(--bf-muted); white-space: pre-line; }
.bf-hp { position: absolute; left: -6400px; top: -6400px; }
[data-page][hidden] { display: none; }
@media (max-width: 520px) {
  .bf-sheet { padding: 12px 10px 40px; }
  .bf-form-header, .bf-block { padding: 16px; border-radius: calc(var(--bf-radius) + 2px); }
  /* 16px controls stop iOS Safari from auto-zooming on focus. */
  input[type="text"], input[type="email"], input[type="number"], input[type="date"], textarea, select { font-size: 1rem; }
  .bf-btn { padding: 11px 18px; }
  .bf-nav-actions { flex: 1 1 100%; }
  .bf-nav-actions .bf-btn { flex: 1; }
  .bf-pill span { min-width: 38px; padding: 8px 9px; }
  .bf-matrix th, .bf-matrix td { padding: 8px; }
  .bf-brand { gap: 7px; padding: 4px 6px; font-size: 0.9rem; }
  .bf-brand svg { width: 20px; height: 20px; }
}
`.trim();

export const FORM_RUNTIME_JS = `
(function () {
  "use strict";

  var form = document.getElementById("beeblio-form");
  if (!form) return;
  var definition = null;
  try {
    definition = JSON.parse(document.getElementById("beeblio-form-definition").textContent);
  } catch (error) {
    definition = null;
  }
  var confirmation =
    (definition && definition.settings && definition.settings.confirmationMessage) ||
    "Thanks — your response was recorded.";

  var pages = Array.prototype.slice.call(form.querySelectorAll("[data-page]"));
  var pageIndex = 0;
  var submitButton = form.querySelector("button[type=submit]");
  var backButton = form.querySelector("[data-nav=back]");
  var nextButton = form.querySelector("[data-nav=next]");

  function showPage(index) {
    pageIndex = index;
    pages.forEach(function (page, i) {
      page.hidden = i !== index;
    });
    if (backButton) backButton.hidden = index === 0;
    if (nextButton) nextButton.hidden = index === pages.length - 1;
    if (submitButton) submitButton.hidden = index !== pages.length - 1;
    window.scrollTo({ top: 0 });
  }

  function blockAnswered(block) {
    var type = block.getAttribute("data-type");
    var checked = block.querySelectorAll("input:checked").length;
    if (type === "matrix") {
      var rows = block.querySelectorAll("tbody tr").length;
      return checked >= rows;
    }
    if (checked > 0) return true;
    var input = block.querySelector("input[type=text], input[type=email], input[type=number], input[type=date], textarea, select");
    if (!input || input.disabled) return false;
    return input.value.trim() !== "" && input.checkValidity();
  }

  function validatePage(index) {
    var valid = true;
    var firstInvalid = null;
    pages[index].querySelectorAll(".bf-block[data-required=true]").forEach(function (block) {
      var ok = blockAnswered(block);
      block.classList.toggle("bf-invalid", !ok);
      if (!ok) {
        valid = false;
        if (!firstInvalid) firstInvalid = block;
      }
    });
    if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return valid;
  }

  function goToNextPage(event) {
    event.preventDefault();
    if (validatePage(pageIndex)) showPage(Math.min(pageIndex + 1, pages.length - 1));
  }
  function goToPreviousPage(event) {
    event.preventDefault();
    showPage(Math.max(pageIndex - 1, 0));
  }

  // An unanswered required block becomes invalid as soon as the user tries to
  // move on; clear the error the moment it is answered.
  form.addEventListener("change", function (event) {
    var block = event.target.closest(".bf-block");
    if (block && block.classList.contains("bf-invalid") && blockAnswered(block)) {
      block.classList.remove("bf-invalid");
    }
    syncOtherFields();
  });

  var otherFields = Array.prototype.slice.call(form.querySelectorAll("[data-other-for]"));
  function syncOtherFields() {
    otherFields.forEach(function (wrap) {
      var id = wrap.getAttribute("data-other-for");
      var chosenOther = Array.prototype.some.call(
        form.querySelectorAll('input[name="' + id + '"]'),
        function (input) {
          return (input.type === "radio" || input.type === "checkbox") && input.checked && input.value === "__other__";
        }
      );
      wrap.style.display = chosenOther ? "block" : "none";
      var text = wrap.querySelector("input");
      if (text) text.disabled = !chosenOther;
    });
  }
  syncOtherFields();

  // Star ratings: highlight every star up to the chosen/hovered one.
  form.querySelectorAll(".bf-stars").forEach(function (stars) {
    var starLabels = Array.prototype.slice.call(stars.querySelectorAll(".bf-star"));
    function paint(activeCount) {
      starLabels.forEach(function (label, index) {
        label.classList.toggle("bf-on", index < activeCount);
      });
    }
    function checkedValue() {
      var checked = stars.querySelector("input:checked");
      return checked ? Number(checked.value) : 0;
    }
    starLabels.forEach(function (label, index) {
      label.addEventListener("mouseenter", function () { paint(index + 1); });
      label.addEventListener("mouseleave", function () { paint(checkedValue()); });
    });
    stars.addEventListener("change", function () { paint(checkedValue()); });
    paint(checkedValue());
  });

  var status = form.querySelector(".bf-status");

  function showMessage(text, isError) {
    if (!status) return;
    status.textContent = text;
    status.className = "bf-status bf-show" + (isError ? " bf-status-error" : "");
  }

  function resolveSubmitUrl() {
    var match = location.pathname.match(/^\\/api\\/share\\/([A-Za-z0-9-]+)\\//);
    return match ? "/api/share/" + match[1] + "/submit" : null;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!validateAllPages()) return;
    if (form.querySelector('input[name="_beeblio_hp"]') && form.querySelector('input[name="_beeblio_hp"]').value !== "") {
      showConfirmation();
      return;
    }
    var url = resolveSubmitUrl();
    if (!url) {
      showMessage("Preview mode — submissions are not recorded.", true);
      return;
    }
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Submitting…"; }
    var params = new URLSearchParams(new FormData(form));
    fetch(url, { method: "POST", body: params })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { ok: response.ok, body: body };
        });
      })
      .then(function (result) {
        if (result.ok) {
          showConfirmation();
        } else {
          showMessage(result.body.error || "The response could not be submitted. Please try again.", true);
          if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Submit"; }
        }
      })
      .catch(function () {
        showMessage("Network error — the response was not submitted. Please try again.", true);
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Submit"; }
      });
  });

  function validateAllPages() {
    for (var i = 0; i <= pageIndex; i++) {
      if (!validatePage(i)) {
        showPage(i);
        return false;
      }
    }
    return true;
  }

  function showConfirmation() {
    var wrap = document.createElement("div");
    wrap.className = "bf-form-header bf-confirmation";
    wrap.innerHTML =
      '<div class="bf-check" aria-hidden="true">\\u2713</div><h2>Response recorded</h2><p></p>';
    wrap.querySelector("p").textContent = confirmation;
    form.hidden = true;
    form.parentElement.insertBefore(wrap, form.nextSibling);
  }

  if (nextButton) nextButton.addEventListener("click", goToNextPage);
  if (backButton) backButton.addEventListener("click", goToPreviousPage);
  showPage(0);
})();
`.trim();
