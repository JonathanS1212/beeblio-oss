// Hand-off between the quick-open picker and the bibliography editor: picking
// a reference (or saving one from online search) should land on that entry in
// references.bib, not just open the database file. The picker stages the focus
// here before opening the file because the editor that consumes it mounts only
// afterwards and would miss a directly dispatched event.

export const LIBRARY_REFERENCE_FOCUS_EVENT = "beeblio:library-reference-focus";

export type LibraryReferenceFocusDetail = {
  citationKey: string;
};

let pendingFocus: LibraryReferenceFocusDetail | null = null;

export function setPendingLibraryFocus(detail: LibraryReferenceFocusDetail) {
  pendingFocus = detail;
}

export function takePendingLibraryFocus() {
  const detail = pendingFocus;
  pendingFocus = null;
  return detail;
}
