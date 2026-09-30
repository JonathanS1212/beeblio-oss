---
name: svg-diagram
description: Generates highly aesthetic, modern, soft-styled SVG diagrams natively without relying on Mermaid, focusing on precise coordinate layouts, drop shadows, and bezier curves.
---

# Premium SVG Diagram Generation

Use this skill to generate highly polished, modern, and aesthetically pleasing SVG diagrams natively. Choose SVG when the diagram is a standalone visual deliverable that needs branding, precise layout, or visual quality beyond Mermaid's auto-layout — not for ordinary flowcharts (prefer the `mermaid-diagramming` default) and not for diagrams the user will keep drawing on (prefer `excalidraw-diagramming`). This approach bypasses the visual limitations of tools like Mermaid and is ideal for executive presentations, UI wireframes, and enterprise architecture documents.

## Core aesthetic principles

- **Color Palette (Soft/Pastels):** Avoid pure harsh primary colors. Use curated, soft background fills with slightly darker, saturated borders and text (e.g., Blue: Fill `#f5f9ff`, Stroke `#d4e4f7`, Text `#00477a`).
- **Curved Angles & Radii:** Use `rx="12"` (or higher) on `<rect>` elements to create soft cards or pill shapes.
- **Smooth Connectors:** Avoid sharp right-angle connectors. Use quadratic (`Q`) or cubic (`C`) Bézier curves for connecting lines.
- **Depth & Shadows:** Always define a subtle drop shadow filter in `<defs>` and apply it using `filter="url(#shadow)"`.

## Layout & adaptive detail management

- **Adaptive Canvas Sizing:** Pick a `viewBox` that fits the content density (e.g., `900x600` for simple to `1600x1100` for complex). Set `width="100%"` and `height="100%"` on the root SVG.
- **Breathing Room:** Never let text or boxes overlap with section titles. Always leave at least `30px` to `50px` of vertical padding below headers.
- **Mathematical Alignment:** Calculate centers explicitly so lines exactly meet borders without overlapping.

## Typography & text handling

- **Global Fonts:** Apply `font-family="Geist, Inter, Helvetica Neue, Arial, sans-serif"` at the top-level.
- **Text Wrapping:** SVG doesn't support native wrapping inside `<rect>`. Manually break text into multiple `<text>` lines.
- **Text Legibility over Connectors:** Text placed over lines must have a white background or outline halo (`paint-order="stroke fill" stroke="#ffffff" stroke-width="4"`).

## Advanced SVG techniques

- **Strict Layering (Z-Index):** Maintain this exact order: 1. Backgrounds, 2. Lines/connectors, 3. Foreground shapes/cards, 4. Text/labels.
- **No Emojis:** NEVER use emojis anywhere in the diagram. Use pure SVG paths/shapes if an icon is needed.
