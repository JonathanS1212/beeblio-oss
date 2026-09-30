---
name: mermaid-diagramming
description: Create or edit Mermaid flowcharts that must parse reliably before they are returned or inserted into a document.
---

# Mermaid Diagramming

Mermaid is the default diagram format for this workspace: use it for diagrams embedded in Markdown documents and quick conceptual flowcharts. Switch to SVG (`svg-diagram`) only when the deliverable needs pixel-level polish or a layout Mermaid cannot express, and to Excalidraw (`excalidraw-diagramming`) only when the user will keep drawing on the diagram.

## Authoring rules

- Prefer `flowchart TD` or `flowchart LR` over the legacy `graph` spelling.
- Use short ASCII node IDs such as `A`, `claim_db`, or `review_1`.
- **Every human-readable node label MUST be double-quoted inside its shape delimiters. Never emit `A[Label]` or `B{Decision}`.** Write `A["Label"]`, `B{"Decision"}`, and `C(["Terminal label"])`.
- Parentheses, colons, percentages, ampersands, slashes, commas, periods, hyphens, and non-ASCII characters belong only inside those quoted labels.
- Keep syntax outside labels ASCII. Unicode is fine inside quoted labels.
- Use one statement per line. Semicolons are unnecessary.
- Avoid HTML, Markdown, icons, click handlers, initialization directives, and custom styling unless the user asks for them.
- Prefer several concise nodes over one node containing a paragraph.

## Required validation loop

1. Draft raw Mermaid source without code fences.
2. Call `validate_mermaid` with that source.
3. If it is invalid, use the parser error to repair it and validate again. Make at most three validation attempts; after that, report the remaining error instead of inserting broken syntax.
4. Only after validation succeeds, return it or insert it into the target document.
5. When embedding in Markdown, wrap the validated raw source in exactly one `mermaid` code fence. For a standalone `.mmd` or `.mermaid` file, write raw source without fences.

Never claim that a Mermaid diagram is valid based only on visual inspection.
