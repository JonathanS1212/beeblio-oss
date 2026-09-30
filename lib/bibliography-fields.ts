// Shared entry-type metadata for the Add Reference and Edit Reference forms
// plus the bibliography server action, so all three agree on which fields
// belong to which BibTeX entry type.

export const ENTRY_TYPES = [
  { value: "article", label: "Journal Article" },
  { value: "book", label: "Book" },
  { value: "inbook", label: "Chapter in a Book" },
  { value: "incollection", label: "Chapter in a Collection" },
  { value: "inproceedings", label: "Conference Paper" },
  { value: "phdthesis", label: "PhD Thesis" },
  { value: "mastersthesis", label: "Master's Thesis" },
  { value: "techreport", label: "Technical Report" },
  { value: "manual", label: "Manual or Documentation" },
  { value: "misc", label: "Miscellaneous" },
  { value: "online", label: "Web Resource" },
  { value: "unpublished", label: "Unpublished Work" },
] as const;

// Fields that only make sense for some entry types; anything not listed here
// (title, author, month, abstract, …) applies to every type. The bibliography
// action drops fields whose type is not listed.
export const TYPE_SPECIFIC_FIELDS: Record<string, readonly string[]> = {
  editor: ["book", "inbook", "incollection", "inproceedings", "conference"],
  edition: ["book", "inbook", "incollection"],
  series: ["book", "inbook", "incollection", "inproceedings", "conference"],
  address: ["book", "inbook", "incollection", "inproceedings", "conference", "techreport", "manual", "phdthesis", "mastersthesis", "misc"],
  school: ["phdthesis", "mastersthesis"],
  institution: ["techreport"],
  organization: ["inproceedings", "conference", "online", "misc"],
  howpublished: ["misc", "online"],
};

export function typeSpecificFieldApplies(name: string, type: string) {
  const types = TYPE_SPECIFIC_FIELDS[name];
  return !types || types.includes(type);
}

/** BibTeX field name the container value is stored under, or "" when the type has none. */
export function containerFieldForType(type: string) {
  if (type === "article") return "journal";
  if (["inproceedings", "conference", "incollection", "inbook"].includes(type)) return "booktitle";
  return "";
}

/** Form label for the container field, or undefined when the type has no container. */
export function containerLabelForType(type: string) {
  if (type === "article") return "Journal";
  if (["inproceedings", "conference", "incollection", "inbook"].includes(type)) return "Book or Proceedings Title";
  return undefined;
}
