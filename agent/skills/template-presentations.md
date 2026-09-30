---
name: template-presentations
description: Handle requests involving existing DOCX or PPTX templates without corrupting or falsely claiming preservation of the template.
---

# Template Driven Presentations & Reporting

Office files are binary ZIP packages and are not safe to edit with generic workspace scripts. Do not guess package imports, manipulate slide XML, or claim a binary document is valid without a format-specific tool and validation pass.

## Supported workflow

- For PPTX, load `pptx` and follow its "Creating a presentation FROM a user-provided template" and Editing sections: inventory the template programmatically, inherit its layouts, fonts, and colors, build on a copy, and run the programmatic verification checklist before reporting done.
- For DOCX, load `docx` and follow its Edit route (`routes/edit.md`), which edits the OOXML directly and preserves formatting.
- Keep the original template immutable and write any generated binary to a new path.
- A binary result is complete only after it can be reopened and its pages/slides are rendered or otherwise validated.

Complete and verify all requested artifacts before reporting the outcome. Never invent a successful export when only a source document was created.
