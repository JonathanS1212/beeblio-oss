# Beeblio PowerPoint presentations

Use for `.pptx` creation and edits. Preserve input decks and save versioned outputs. Work in the linked project folder. PptxGenJS is a project dependency; other editors and renderers depend on the host. Do not assume `/opt/beeblio-skills` exists.

## Route

1. **Read:** use `read_office` to extract text. It does not show visual hierarchy, charts, clipping, or exact slide layout. Render or open the deck before judging design.
2. **Create:** outline the audience, key message, and slide order. Make one point per slide, use readable type, and vary layouts to fit the content. Generate editable text, shapes, tables, and charts with PptxGenJS where possible. Keep the short generating script beside the deck and retain source data and image credits.
3. **Use a template:** inspect slide size, master/theme, fonts, colors, and sample layouts first. Generate in a copy or use a tested editing library if the host provides one. Do not promise exact fidelity from text extraction or from rebuilding slides.
4. **Edit an existing deck:** identify the exact slides and shapes to change. Make a copy; preserve unrelated slides, theme, notes, charts, and editability. If only PptxGenJS is available, it is primarily a creation tool, so do not silently reconstruct an existing deck. Use an installed editing library after a preservation check, or report the limitation and provide an updated replacement deck.

## Verification

Reopen the saved deck and check slide count, text, numbers, chart data, media, and notes. Call `verify_office` on the output, with `sourceFilePath` for an edit. If the application checkout is accessible, `python3 scripts/office/verify.py OUTPUT.pptx --render-dir PREVIEW_DIR` can also produce slide previews. Inspect **every** slide preview for clipping, overlap, tiny labels, missing images, font substitution, and inconsistent alignment. Structural checks cannot decide whether a slide looks good. If no renderer is available, report that visual review remains open.
