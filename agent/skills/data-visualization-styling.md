---
name: data-visualization-styling
description: Generate publication-ready charts with native Python visualization libraries or an existing Vega-Lite specification.
---

# Data Visualization Styling Guide

When asked to create charts or visualizations, you MUST adhere to the following academic and publication-ready guidelines:

## Library Preferences & Technical Execution
- Default to a saved Python script under `/workspace/3-Analysis` using pandas/Polars plus Matplotlib or Seaborn, executed with `run_analysis`. The Batch image sets Matplotlib's non-interactive `Agg` backend automatically.
- Read source datasets directly by path. Keep chart-specific transformations in the script and avoid creating a separate derived dataset unless the transformation is analytically meaningful or the user requests it.
- Export PNG for ordinary display, SVG for editable vector graphics, and PDF for print workflows. Use explicit figure dimensions, DPI, and `bbox_inches="tight"` where appropriate.
- Keep the successful script beside its outputs as the reproducible specification. Record input paths and relevant filter/aggregation choices near the top of the script.

## APA Formatting & Aesthetics
- **Simplicity:** Eliminate "chart junk". Remove unnecessary grid lines, borders, and background colors.
- **Color Palettes:** Use colorblind-friendly palettes (like Okabe-Ito) or strict grayscale. Never rely solely on color to distinguish elements; combine with patterns or distinct marker shapes.
- **Typography:** Use clean, readable fonts (e.g., Arial, Helvetica, or standard sans-serif). Ensure font sizes are legible when printed on standard A4/Letter pages.
- **Axis & Legends:**
  - Axis labels must be clear, descriptive, and include units of measurement.
  - Set axis limits logically (e.g., starting at 0 for counts/frequencies unless focusing on a specific variance).
  - Place legends where they do not obscure data (preferably top, bottom, or outside the plot area).
- **Titles:** Keep chart titles concise. In academic contexts, figures often rely on captions rather than embedded titles; follow the user's preference if specified.

## Output & Exports
- Provide the generated Python script as the reproducible artifact. For Vega-Lite compatibility work, provide the `*.vl.json` specification instead.
- For Word, prefer a high-resolution PNG; for LaTeX and print, prefer PDF or SVG when the destination supports it.
