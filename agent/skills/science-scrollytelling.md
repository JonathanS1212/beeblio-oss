---
name: science-scrollytelling
description: Build interactive, single-page "Scrollytelling" web applications that translate scientific findings into engaging narratives.
---

# Science Scrollytelling

Use this skill when translating complex findings (like those from a scientific paper, dataset, or text document) into an engaging, data-driven narrative for a general audience.

## Runtime contract

Produce a self-contained HTML/JS/CSS artifact, or use a lightweight setup (like React/Tailwind) if the environment supports it. Build any generated assets through `run_analysis`; the resulting interactive HTML is viewed in Beeblio's sandboxed browser iframe.

## Data and narrative extraction

1. **The Core Narrative:** Break the content down into 5 to 8 sequential "Story Sections" (e.g., Introduction, The Problem, Methodology, Key Findings, Conclusion). Keep the text accessible but scientifically accurate.
2. **The Data:** Extract the most compelling data point, statistic, or table for each section. Do not hallucinate data; use only what is provided.
3. **Data Structure:** Keep all chart data in a clean JSON-like structure embedded in the script (or a separate data block), separated from the DOM.

## Architecture and layout

- Build an immersive scrollytelling layout such as:
  - **Classic Sidecar:** Split layout with scrolling text on one side and a sticky visualization on the other.
  - **Immersive Overlay:** Full-screen background visualization with scrolling text in semi-transparent cards.
- Ensure ample vertical scrolling space (e.g., `min-h-[150vh]` per section) so narrative pacing feels deliberate and transitions have time to breathe.

## Interactivity and state

- Implement an Intersection Observer (or scroll-tracking logic) to detect the active "Story Section" in the viewport.
- Maintain a state (e.g., `activeSectionId`) based on the scroll position.
- Smoothly transition, animate, or redraw visualizations to reflect the data relevant to the active text.

## Visualizations & aesthetic

- Use visual metaphors and interactive diagrams beyond standard charts.
- The UI should resemble high-end data journalism with a curated color palette (avoid generic web colors) and modern typography (e.g., Inter, Geist, or a clean sans-serif).
- **Responsive design:** On mobile devices, stack the layout so the visualization is sticky at the top or bottom while the text scrolls.
- Add subtle micro-animations like fade-ins for text and fluid transitions between data states.
