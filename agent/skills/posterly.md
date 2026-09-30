---
name: posterly
description: Build an academic conference poster as a self-contained HTML/CSS artifact, with print-ready PDF export only when a dedicated browser renderer is available.
---

# posterly — HTML/CSS Academic Poster Workflow

Use this skill to design and build an academic research poster as a single HTML file styled for an exact print canvas. Use a locally installed browser renderer for PDF only when available, and inspect its output before claiming print fidelity.

## Canvas and design constraints

- **Measurement is key:** The screen preview is not a reliable source of truth. Rely on explicit canvas dimensions and emulate print media at the correct viewport.
- **Units:** Use standard print CSS units (`calc(N * var(--u))`) and explicit pixel dimensions computed for 96 PPI.
- **Design discovery:** Do not guess colors, logos, or styles. Confirm venue specifications, layout (e.g., 3-column, top-hero), and typography choices before heavily scaffolding content.

## Authoring workflow

1. **Venue Specification:** Identify the required dimensions, orientation, font-size minimums, and anonymity rules from the conference guidelines.
2. **Image Preprocessing:** Convert vector figures (EPS/PDF) to SVG or high-res PNG for proper rendering in the browser. Autocrop whitespace.
3. **Scaffolding:** Build a responsive grid skeleton matching the desired layout. Maintain required data attributes (e.g., `data-measure-role`) if integrating with specific measure tools.
4. **Content Audit:** Cross-check numbers, claims, theorem preconditions, and author metadata against the source paper to ensure absolute fidelity.
5. **Balancing & Polish:** Ensure all columns are balanced. Drop secondary blocks (like a bottom takeaways strip or top framework banner) if space is constrained in favor of larger figures and readable body text.

## Typography and microcopy

- Use clear, legible typefaces suitable for reading from a distance (e.g., 2 meters).
- **Emphasis discipline:** Bold sparingly. Emphasize the phrases that carry the core claim, not every numeral or repeated method name.
- **Copy voice:** Write crisp, telegraphic copy. Avoid filler words, AI-generated generalizations, and formulaic constructions.

## Deliverables

- Write the complete poster as a standalone `.html` artifact.
- Preserve all structural constraints required for automated PDF rendering tools to parse and measure the poster.
- State clearly when only the HTML deliverable was produced. Do not claim print fidelity without rendering and inspecting the PDF.
