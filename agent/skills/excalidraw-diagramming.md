---
name: excalidraw-diagramming
description: Create, read, or edit Excalidraw whiteboard diagrams (.excalidraw files) through the read_excalidraw and update_excalidraw tools; use for flowcharts, research-design sketches, and system diagrams the user can keep drawing on.
---

# Excalidraw Diagramming

Use Excalidraw when the user names it, attaches a `.excalidraw` file, or wants an editable
whiteboard-style diagram. Prefer Mermaid for text-embeddable flowcharts (`mermaid-diagramming`)
and native SVG for polished static graphics (`svg-diagram`); `.excalidraw` files are standalone
workspace artifacts and cannot be embedded in Markdown documents.

**Never write Excalidraw JSON by hand** — it is verbose, error-prone, and rejected by
`write_file`. Use the tools: they generate ids, seeds, bindings, bound labels, and arrow
geometry from a compact description.

## Workflow

1. For an existing diagram, call `read_excalidraw` first. It returns a compact digest
   (ids, types, labels, positions, arrow from/to) — use those ids verbatim in edits.
   If `workspace_context` carries `unsavedContent` for the file, pass it to the tool's
   `content`/`unsavedContent` parameter so edits apply to the editor snapshot, not stale disk.
2. Create or edit with `update_excalidraw` operations (`add_elements`, `update_elements`,
   `delete_elements`). Operations apply atomically; a failed batch changes nothing.
3. Check the returned post-edit digest: labels, arrow endpoints, and element count.
   Iterate with follow-up operations until the layout reads well.

## Designing the diagram

- Plan on a grid before writing operations: flow left-to-right (columns ≈ 300px apart) or
  top-down (rows ≈ 180px apart); give branch points room to fan out. Unpositioned shapes
  auto-stack in one column — fine for quick lists, not for flows.
- Give every element a short semantic id (`collect`, `model`, `arrow-1`); arrows reference
  shapes by `from`/`to` id and redraw automatically when shapes move or resize.
- Shape semantics: `rectangle` = process or step, `ellipse` = start/end/trigger,
  `diamond` = decision or condition, `text` = free-floating annotation or section title,
  `arrow` = directed relationship (add `label` like "yes"/"no" on decision branches),
  `line` = undirected grouping, `dashed: true` = optional or weak relation.
- Every claimed relationship needs an arrow; position alone implies nothing. A diagram
  should argue: different visual pattern per concept (fan-out, convergence, cycle, tiers),
  not a uniform grid of boxes.
- Keep labels short (≤ 4 words where possible); use `\n` for two-line labels. Omit
  `width`/`height` and let the tool size shapes from their labels.
- Color semantically, not decoratively: one soft fill + darker matching stroke per role
  (e.g. data `#a5d8ff`/`#1971c2`, decision `#ffec99`/`#e67700`, terminal `#d3f9d8`/`#2f9e44`,
  accent text/edges `#1e1e1e`). Reuse a role's pair consistently.

## Editing rules

- Update by id: relabel with `label`, reposition with absolute `x`/`y`, restyle with
  `color`/`fill`/`dashed`. Moving a shape carries its label and redraws attached arrows.
- Connectors cannot be moved directly; move or resize the shapes they connect instead.
- Deleting a shape removes its label; arrows that pointed at it are unbound, not deleted —
  delete them explicitly when the connection should disappear.
- State the file path when done; use `open_file` when showing the result would help.
