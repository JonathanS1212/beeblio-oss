"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronUp, FileText, Loader2, Paperclip, Pencil, Save, Search, Table2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { splitBibtexAuthors, joinBibtexAuthors } from "@/lib/bibtex";
import { REFERENCES_DIRECTORY } from "@/lib/project-bibliography";
import type { LiteratureItem, LiteratureSource } from "@/lib/literature/types";
import { extractPaperReference, lookupBibliographyDoi } from "../bibliography-actions";
import { listFiles } from "../file-actions";
import { uploadWorkspaceFile } from "@/lib/workspace-upload";
import { ENTRY_TYPES, containerLabelForType, typeSpecificFieldApplies } from "@/lib/bibliography-fields";
import { openWorkspaceEntry } from "@/lib/chat-context";

export const literatureSourceLabels: Record<LiteratureSource, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  pubmed: "PubMed",
};

/** The editable form state shared by the Add Reference and Edit Reference flows. */
export type ReferenceDraft = {
  key: string; type: string; title: string; authors: string; year: string; date: string;
  container: string; publisher: string; volume: string; issue: string;
  pages: string; doi: string; url: string;
  abstract: string; keywords: string; note: string; file: string; month: string;
  editor: string; edition: string; series: string; address: string;
  school: string; institution: string; organization: string; howpublished: string;
  urldate: string;
};

export const emptyReferenceDraft: ReferenceDraft = {
  key: "", type: "article", title: "", authors: "", year: "", date: "", container: "",
  publisher: "", volume: "", issue: "", pages: "", doi: "", url: "",
  abstract: "", keywords: "", note: "", file: "", month: "",
  editor: "", edition: "", series: "", address: "",
  school: "", institution: "", organization: "", howpublished: "",
  urldate: "",
};

/** Read-only view data for one reference, normalized across search results and bibliography entries. */
export type ReferenceDetail = {
  title: string;
  authors?: string;
  type?: string;
  key?: string;
  year?: string;
  date?: string;
  publicationDate?: string;
  container?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  url?: string;
  abstract?: string;
  keywords?: string;
  note?: string;
  file?: string;
  month?: string;
  editor?: string;
  edition?: string;
  series?: string;
  address?: string;
  school?: string;
  institution?: string;
  organization?: string;
  howpublished?: string;
  urldate?: string;
  sources?: string[];
  citationCount?: number;
  isOpenAccess?: boolean;
  duplicateKey?: boolean;
};

export function referenceFromSearchItem(item: LiteratureItem): ReferenceDetail {
  return {
    title: item.title,
    authors: item.authors.length > 0 ? item.authors.join(", ") : undefined,
    year: item.year ? String(item.year) : undefined,
    publicationDate: item.publicationDate,
    container: item.venue,
    doi: item.doi,
    pmid: item.pmid,
    pmcid: item.pmcid,
    url: item.openAccessUrl || item.url,
    abstract: item.abstract,
    keywords: item.keywords?.join(", "),
    sources: item.sources.map((source) => literatureSourceLabels[source]),
    citationCount: item.citationCount,
    isOpenAccess: item.isOpenAccess,
  };
}

function hasExtendedValues(draft?: ReferenceDraft) {
  return Boolean(draft && (draft.abstract || draft.keywords || draft.note || draft.file || draft.month
    || draft.editor || draft.edition || draft.series || draft.address || draft.school
    || draft.institution || draft.organization || draft.howpublished || draft.urldate));
}

function safeHttpUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function referenceLink(reference: ReferenceDetail) {
  const doi = reference.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  return safeHttpUrl(doi ? `https://doi.org/${doi}` : reference.url);
}

function detailLink(href: string) {
  return <a href={href} target="_blank" rel="noreferrer" className="break-all text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">{href}</a>;
}

function pagesValue(value: string) {
  return value.replaceAll("--", "–").replaceAll(/\s*-\s*/g, "–");
}

/** The workspace path behind a Linked File value, dropping any trailing ":TYPE" annotation ("1-References/paper.pdf:PDF" → "1-References/paper.pdf"). */
function linkedFilePath(value: string) {
  return value.replace(/:[A-Za-z]+$/, "").trim();
}

/** Header display form of an author list: BibTeX's " and " separators become ", ". */
function displayAuthors(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return splitBibtexAuthors(trimmed).join(", ");
}

/**
 * The single surface for viewing and editing a reference. Opens as a sheet
 * from the right rail: preview mode shows normalized metadata, edit mode the
 * shared Add/Edit form (with DOI lookup when projectId is given).
 */
export function ReferenceSheet({
  open,
  onOpenChange,
  mode,
  reference,
  initialDraft,
  projectId,
  doiLookup = false,
  requireKey = false,
  saveLabel = "Save",
  saving = false,
  autoFocusDoi = false,
  duplicateKey = false,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onAddToMatrix,
  addingToMatrix = false,
  matrixSaved = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "preview" | "edit";
  reference?: ReferenceDetail;
  initialDraft?: ReferenceDraft;
  /** The project workspace — enables the Linked File picker and suggestions. */
  projectId?: string;
  /** Shows the DOI lookup block (the Add Reference flow). */
  doiLookup?: boolean;
  /** The citation key is a required field (editing an existing entry). */
  requireKey?: boolean;
  saveLabel?: string;
  saving?: boolean;
  autoFocusDoi?: boolean;
  duplicateKey?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSave?: (draft: ReferenceDraft) => Promise<boolean> | boolean;
  onDelete?: () => void;
  onAddToMatrix?: () => void;
  addingToMatrix?: boolean;
  matrixSaved?: boolean;
}) {
  const [draft, setDraft] = useState<ReferenceDraft>(() => initialDraft ?? emptyReferenceDraft);
  const [moreOpen, setMoreOpen] = useState(() => hasExtendedValues(initialDraft));
  const [doiBusy, setDoiBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  // Keep rendering the last reference while the sheet animates closed.
  const [cachedReference, setCachedReference] = useState<ReferenceDetail>();
  const seedRef = useRef(initialDraft);
  seedRef.current = initialDraft;

  useEffect(() => {
    if (reference) setCachedReference(reference);
  }, [reference]);

  // Re-seed the form whenever editing starts, so saved changes from a prior
  // round trip are picked up without remounting the sheet.
  useEffect(() => {
    if (open && mode === "edit") {
      setDraft(seedRef.current ?? emptyReferenceDraft);
      setMoreOpen(hasExtendedValues(seedRef.current));
    }
  }, [open, mode]);

  const lookupDoi = async () => {
    if (!projectId) return;
    setDoiBusy(true);
    try {
      const result = await lookupBibliographyDoi(projectId, draft.doi);
      if (!result.success) return toast.error("DOI metadata was not found", { description: result.error });
      setDraft((current) => ({ ...current, ...result.reference, key: current.key }));
      if (result.reference.abstract || result.reference.keywords) setMoreOpen(true);
      toast.success("Metadata found", { description: `Matched through ${result.sources.join(", ")}. Review the fields before adding.` });
    } finally {
      setDoiBusy(false);
    }
  };

  // The Add form's PDF import rides the same backend as the Library drop:
  // upload the PDF to References, match the work (DOI in the PDF text, else a
  // Crossref title search), then merge the fields into the form — like the DOI
  // lookup, the user reviews them before saving.
  const importPdf = async (file: File) => {
    if (!projectId) return;
    if (!file.name.toLocaleLowerCase().endsWith(".pdf")) {
      toast.error("Choose a PDF file.");
      return;
    }
    setPdfBusy(true);
    try {
      const upload = await uploadWorkspaceFile(projectId, REFERENCES_DIRECTORY, file);
      if (!upload.success) return toast.error("PDF could not be uploaded", { description: upload.error });
      const result = await extractPaperReference(projectId, upload.file.path);
      if (!result.success) return toast.error("Metadata was not extracted", { description: result.error });
      setDraft((current) => ({ ...current, ...result.reference, key: current.key }));
      if (result.reference.abstract || result.reference.keywords || result.reference.file) setMoreOpen(true);
      toast.success("Metadata found", {
        description: `Matched by ${result.matchedBy}. The PDF was saved to References — review the fields before adding.`,
      });
    } finally {
      setPdfBusy(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const save = async () => {
    if (!onSave) return;
    await onSave(draft);
  };

  const field = (key: keyof ReferenceDraft, label: ReactNode, placeholder?: string, className?: string) => (
    <div className={className}>
      <Label htmlFor={`reference-${key}`} className="text-xs">{label}</Label>
      <Input id={`reference-${key}`} className="mt-1 h-9 text-xs md:text-xs" value={draft[key]} placeholder={placeholder} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
    </div>
  );

  const textarea = (key: keyof ReferenceDraft, label: string, placeholder?: string, className?: string, minHeight = "min-h-16") => (
    <div className={className}>
      <Label htmlFor={`reference-${key}`} className="text-xs">{label}</Label>
      <Textarea id={`reference-${key}`} className={cn("mt-1 text-xs md:text-xs", minHeight)} value={draft[key]} placeholder={placeholder} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
    </div>
  );

  const shown = reference ?? cachedReference;
  const editing = mode === "edit";
  // The PDF import belongs to the blank Add Reference form — the add flows are
  // the only callers that pass doiLookup with a project workspace.
  const onlineSource = draft.type === "online";
  const showPdfImport = editing && doiLookup && !onlineSource && Boolean(projectId);
  const headerTitle = editing
    ? (shown?.title || (requireKey ? "Edit Reference" : "Add Reference"))
    : (shown?.title || "Untitled reference");
  const headerAuthors = displayAuthors(editing ? draft.authors : shown?.authors);
  const containerLabel = containerLabelForType(draft.type)
    ?? (seedRef.current?.container ? "Journal or Book Title" : undefined);
  const openLink = editing ? undefined : referenceLink(shown ?? { title: "" });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Matches the agent rail width (w-[380px] in project-layout-ui) so the sheet aligns with the chat panel. */}
      <SheetContent className="w-full gap-0 sm:max-w-[380px]">
        <SheetHeader className="gap-1 border-b px-4 py-3 pr-10">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="min-w-0 flex-1 text-sm leading-5">{headerTitle}</SheetTitle>
            {showPdfImport ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                disabled={saving || pdfBusy}
                onClick={() => pdfInputRef.current?.click()}
                aria-label="Import metadata from a PDF"
                title="Import metadata from a PDF"
              >
                {pdfBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                PDF
              </Button>
            ) : null}
          </div>
          {headerAuthors ? (
            <ShowMoreText
              as={SheetDescription}
              text={headerAuthors}
              resetKey={shown}
              className="text-xs leading-4"
            />
          ) : (
            <SheetDescription className="sr-only">Reference details</SheetDescription>
          )}
        </SheetHeader>
        {showPdfImport ? (
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importPdf(file);
            }}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {editing ? (
            <div className="space-y-4">
              {projectId && doiLookup && !onlineSource ? (
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <Label htmlFor="reference-doi-lookup" className="text-xs">DOI Lookup</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      id="reference-doi-lookup"
                      className="h-9 text-xs md:text-xs"
                      value={draft.doi}
                      placeholder="10.1000/example"
                      disabled={saving}
                      autoFocus={autoFocusDoi}
                      onChange={(event) => setDraft((current) => ({ ...current, doi: event.target.value }))}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void lookupDoi(); } }}
                    />
                    <Button type="button" size="sm" variant="secondary" className="h-9" disabled={saving || doiBusy || !draft.doi.trim()} onClick={() => void lookupDoi()}>
                      {doiBusy ? <Loader2 className="animate-spin" /> : <Search />}
                      {doiBusy ? "Searching…" : "Find"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {field("key", <>Citation Key{!requireKey && <span className="font-normal text-muted-foreground"> (Optional)</span>}</>, "smith-2026-example")}
                <div>
                  <Label htmlFor="reference-type" className="text-xs">Entry Type</Label>
                  <Select value={draft.type} onValueChange={(value) => setDraft((current) => ({ ...current, type: value }))} disabled={saving}>
                    <SelectTrigger id="reference-type" size="sm" className="mt-1 w-full text-xs">
                      <SelectValue placeholder="article" />
                    </SelectTrigger>
                    <SelectContent>
                      {(ENTRY_TYPES.some((option) => option.value === draft.type)
                        ? ENTRY_TYPES
                        : [{ value: draft.type, label: draft.type }, ...ENTRY_TYPES]
                      ).map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field("title", "Title", undefined, "sm:col-span-2")}
                <div className="sm:col-span-2">
                  <Label htmlFor="reference-authors" className="text-xs">{onlineSource ? "Creator or author" : "Authors"}</Label>
                  <ChipListField
                    id="reference-authors"
                    value={draft.authors}
                    placeholder="Type a name, then a comma"
                    disabled={saving}
                    split={splitBibtexAuthors}
                    join={joinBibtexAuthors}
                    onChange={(authors) => setDraft((current) => ({ ...current, authors }))}
                  />
                </div>
                {field("year", onlineSource ? "Published year" : "Year")}
                {onlineSource && field("date", "Published on", "YYYY-MM-DD")}
                {doiLookup && !onlineSource ? null : !onlineSource ? field("doi", "DOI", "10.1000/example") : null}
                {containerLabel ? field("container", containerLabel) : null}
                {onlineSource ? field("organization", "Website or channel") : field("publisher", "Publisher")}
                {!onlineSource && field("volume", "Volume")}
                {!onlineSource && field("issue", "Issue")}
                {!onlineSource && field("pages", "Pages")}
                {field("url", "URL", undefined, "sm:col-span-2")}
                {onlineSource && field("urldate", "Accessed on", "YYYY-MM-DD")}
                {onlineSource && field("howpublished", "Format or platform", "YouTube video, podcast, or web page", "sm:col-span-2")}
              </div>
              <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
                    <ChevronDown className={cn("transition-transform", moreOpen && "rotate-180")} />
                    More Details
                    {/* <span className="text-xs text-muted-foreground/70">(abstract, keywords, notes…)</span> */}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    {textarea("abstract", "Abstract", "Auto-filled by the DOI lookup when the provider has one", "sm:col-span-2", "min-h-24")}
                    <div className="sm:col-span-2">
                      <Label htmlFor="reference-keywords" className="text-xs">Keywords</Label>
                      <ChipListField
                        id="reference-keywords"
                        value={draft.keywords}
                        placeholder="Type a keyword, then a comma"
                        disabled={saving}
                        split={splitKeywords}
                        join={joinKeywords}
                        onChange={(keywords) => setDraft((current) => ({ ...current, keywords }))}
                      />
                    </div>
                    {field("month", "Month", "mar")}
                    {!onlineSource && field("urldate", "Accessed On", "YYYY-MM-DD")}
                    <div className="sm:col-span-2">
                      <LinkedFileField
                        projectId={projectId}
                        value={draft.file}
                        disabled={saving}
                        onChange={(file) => setDraft((current) => ({ ...current, file }))}
                      />
                    </div>
                    {textarea("note", "Note", "Why this reference matters for the project", "sm:col-span-2")}
                    {applies("editor") && field("editor", "Editors", "Family, Given and Family, Given", "sm:col-span-2")}
                    {applies("edition") && field("edition", "Edition", "2nd")}
                    {applies("series") && field("series", "Series")}
                    {applies("address") && field("address", "Address")}
                    {applies("school") && field("school", "School", "Massachusetts Institute of Technology", "sm:col-span-2")}
                    {applies("institution") && field("institution", "Institution", "NIST", "sm:col-span-2")}
                    {!onlineSource && applies("organization") && field("organization", "Organization", "ACM", "sm:col-span-2")}
                    {!onlineSource && applies("howpublished") && field("howpublished", "How Published", "arXiv:2401.12345 or a URL", "sm:col-span-2")}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : shown ? (
            <ReferencePreview reference={shown} duplicateKey={duplicateKey} onNavigateAway={() => onOpenChange(false)} />
          ) : null}
        </div>
        <SheetFooter className="flex-row items-center gap-2 border-t px-4 py-3">
          {editing ? (
            <>
              <Button type="button" size="sm" variant="ghost" className="mr-auto" disabled={saving} onClick={() => (onCancelEdit ? onCancelEdit() : onOpenChange(false))}>Cancel</Button>
              <Button type="button" size="sm" disabled={saving || !draft.title.trim() || !draft.type.trim() || (requireKey && !draft.key.trim())} onClick={() => void save()}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "Saving…" : saveLabel}
              </Button>
            </>
          ) : (
            <>
              <div className="mr-auto flex items-center gap-1.5">
                {onAddToMatrix ? (
                  <Button type="button" size="sm" variant="outline" disabled={addingToMatrix} onClick={onAddToMatrix} title={matrixSaved ? "Already in a matrix — click to add it to another" : "Add to the literature matrix"}>
                    {addingToMatrix ? <Loader2 className="animate-spin" /> : matrixSaved ? <Check /> : <Table2 />}
                    {matrixSaved ? "In Matrix" : "Matrix"}
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button type="button" size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={saving} onClick={onDelete}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
              {openLink ? (
                <Button asChild size="sm" variant="outline">
                  <a href={openLink} target="_blank" rel="noreferrer">Open <ArrowUpRight /></a>
                </Button>
              ) : null}
              {onEdit ? (
                <Button type="button" size="sm" disabled={saving} onClick={onEdit}>
                  <Pencil />Edit
                </Button>
              ) : null}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );

  function applies(name: keyof ReferenceDraft) {
    return typeSpecificFieldApplies(name, draft.type) || Boolean(seedRef.current?.[name]);
  }
}

/**
 * The Linked File field: an input that suggests PDFs already stored in
 * 1-References while typing, with an inline picker that uploads new files
 * there and fills in the resulting path.
 */
function LinkedFileField({
  projectId,
  value,
  disabled,
  onChange,
}: {
  projectId?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<string[]>();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const query = value.replace(/^[^/]*\//, "").replace(/:[A-Za-z]+$/, "").trim().toLocaleLowerCase();
  const matches = (options || [])
    .filter((name) => name.toLocaleLowerCase().includes(query))
    .slice(0, 8);
  const highlighted = Math.min(activeIndex, Math.max(0, matches.length - 1));

  const select = (name: string) => {
    onChange(`${REFERENCES_DIRECTORY}/${name}${name.toLocaleLowerCase().endsWith(".pdf") ? ":PDF" : ""}`);
    setOpen(false);
  };

  const loadOptions = async () => {
    if (!projectId) return;
    try {
      const entries = await listFiles(projectId, REFERENCES_DIRECTORY);
      setOptions(entries
        .filter((entry) => !entry.isDir && entry.name.toLocaleLowerCase().endsWith(".pdf"))
        .map((entry) => entry.name));
    } catch {
      setOptions([]);
    }
  };

  const upload = async (file: File) => {
    if (!projectId) return;
    setUploading(true);
    try {
      const result = await uploadWorkspaceFile(projectId, REFERENCES_DIRECTORY, file);
      if (!result.success) return toast.error("File could not be uploaded", { description: result.error });
      setOptions((current) => current?.includes(result.file.name) ? current : [...(current || []), result.file.name]);
      select(result.file.name);
      toast.success("File uploaded", { description: result.file.path });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  if (!projectId) {
    return (
      <>
        <Label htmlFor="reference-file" className="text-xs">Linked File</Label>
        <Input
          id="reference-file"
          className="mt-1 h-9 text-xs md:text-xs"
          value={value}
          placeholder="1-References/paper.pdf:PDF"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </>
    );
  }

  return (
    <>
      <Label htmlFor="reference-file" className="text-xs">Linked File</Label>
      <div className="relative mt-1">
        <Input
          id="reference-file"
          className="h-9 pr-9 text-xs md:text-xs"
          value={value}
          placeholder="1-References/paper.pdf:PDF"
          disabled={disabled || uploading}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            // Refetch on every focus: PDFs can be saved from other panels
            // while the sheet stays mounted.
            void loadOptions();
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (!open || matches.length === 0) return;
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((highlighted + 1) % matches.length); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((highlighted - 1 + matches.length) % matches.length); }
            else if (event.key === "Enter") { event.preventDefault(); select(matches[highlighted]); }
            else if (event.key === "Escape") { setOpen(false); }
          }}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="absolute right-1 top-1 size-7"
          disabled={disabled || uploading}
          aria-label="Upload a file to References"
          title="Upload a file to References"
          onClick={() => uploadInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
        </Button>
        {open && matches.length > 0 ? (
          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
            {options === undefined ? (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading files…
              </div>
            ) : matches.map((name, index) => (
              <button
                key={name}
                type="button"
                data-active={index === highlighted}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs", index === highlighted ? "bg-accent" : "hover:bg-accent/60")}
                onMouseEnter={() => setActiveIndex(index)}
                // Keep focus on the input so blur does not close the popup
                // before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(name)}
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </>
  );
}

/** Keywords keep their saved form — a plain comma-separated list. */
function splitKeywords(value: string) {
  return value.split(",").map((keyword) => keyword.trim()).filter(Boolean);
}

function joinKeywords(keywords: readonly string[]) {
  return keywords.filter(Boolean).join(", ");
}

/**
 * A chip-list input shared by the Authors and Keywords fields: each committed
 * item renders as a colored block; a comma (or Enter) commits the pending
 * text, Backspace on an empty input removes the last block, and blur commits
 * whatever is left. `split`/`join` own the serialized form — authors keep the
 * BibTeX round-trip (blocks re-serialize with " and " separators, and names
 * that already contain commas (DOI lookups fill "Family, Given") keep their
 * comma inside one block), keywords stay a plain comma-separated list.
 */
function ChipListField({
  id,
  value,
  placeholder,
  disabled,
  split,
  join,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  split: (value: string) => string[];
  join: (items: readonly string[]) => string;
  onChange: (value: string) => void;
}) {
  const [buffer, setBuffer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const items = split(value);

  // Commits go through onChange (which changes `value`), so any buffer left
  // after a value change — external re-seeds included — is stale.
  useEffect(() => {
    setBuffer("");
  }, [value]);

  const commit = (raw: string) => {
    const item = raw.trim();
    if (!item) return;
    onChange(join([...items, item]));
  };

  const removeAt = (index: number) => {
    onChange(join(items.filter((_, itemIndex) => itemIndex !== index)));
  };

  return (
    <div
      className="mt-1 flex min-h-9 flex-wrap items-center gap-1 rounded-xl border border-input bg-card/75 px-2 py-1 text-xs shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_1px_2px_rgb(18_35_48/0.035)] transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15 dark:bg-input/30"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        inputRef.current?.focus();
      }}
    >
      {items.map((item, index) => (
        <span
          key={`${index}-${item}`}
          className="flex items-center gap-0.5 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
        >
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            className="rounded-xs text-primary/50 transition-colors hover:text-primary"
            disabled={disabled}
            onClick={() => removeAt(index)}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={buffer}
        disabled={disabled}
        placeholder={items.length === 0 ? placeholder : ""}
        className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/75"
        onChange={(event) => {
          const text = event.target.value;
          if (text.endsWith(",")) {
            commit(text.slice(0, -1));
            setBuffer("");
            return;
          }
          setBuffer(text);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(buffer);
            setBuffer("");
          } else if (event.key === "Backspace" && !buffer && items.length > 0) {
            event.preventDefault();
            removeAt(items.length - 1);
          }
        }}
        onBlur={() => {
          commit(buffer);
          setBuffer("");
        }}
      />
    </div>
  );
}

/**
 * Long text clamped to a few lines with a "Show all/less" control that sits in
 * line after the last visible character: collapsed, the control is anchored to
 * the end of the final clamped line (space reserved with padding so it never
 * covers text); expanded, it follows the text's last character and the block
 * scrolls instead of growing the sheet unboundedly. `resetKey` (the item the
 * text belongs to) collapses it again whenever it changes.
 */
function ShowMoreText({
  text,
  resetKey,
  className,
  collapsedClassName = "line-clamp-2",
  expandedClassName = "max-h-40 overflow-y-auto overscroll-contain",
  as: Component = "p",
}: {
  text: string;
  resetKey: unknown;
  className?: string;
  collapsedClassName?: string;
  expandedClassName?: string;
  as?: ElementType;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  // The control only appears when the clamp actually cuts text off. Re-measured
  // on resize; while expanded the last verdict stays so the control can
  // collapse again.
  useEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const update = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <Component
      ref={textRef}
      className={cn("relative", className, expanded ? expandedClassName : cn(collapsedClassName, "pr-14"))}
    >
      {text}
      {clamped ? (
        <button
          type="button"
          className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium leading-4 text-muted-foreground transition-colors hover:text-foreground",
            expanded ? "mt-1" : "absolute right-0 bottom-0 bg-background pl-1",
          )}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show Less" : "Show All"}
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      ) : null}
    </Component>
  );
}

function ReferencePreview({
  reference,
  duplicateKey,
  onNavigateAway,
}: {
  reference: ReferenceDetail;
  duplicateKey: boolean;
  /** Called when a plain click opens another surface (the linked file), so the sheet gets out of the way. */
  onNavigateAway?: () => void;
}) {
  const pathname = usePathname();
  const link = referenceLink(reference);
  const rows: Array<[string, ReactNode]> = [];
  const add = (label: string, value?: string) => {
    if (value?.trim()) rows.push([label, value]);
  };
  if (reference.key) rows.push(["Citation key", <span key="key" className="font-mono">{reference.key}</span>]);
  add("Year", [reference.year, reference.month].filter(Boolean).join(" "));
  add("Published", reference.publicationDate);
  add("Publication date", reference.date);
  add(reference.type === "article" ? "Journal" : "Journal / Book", reference.container);
  add("Publisher", reference.publisher);
  if (reference.volume || reference.issue || reference.pages) {
    rows.push(["Volume / Issue / Pages", [reference.volume, reference.issue, reference.pages && pagesValue(reference.pages)].filter(Boolean).join(" · ")]);
  }
  add("Editors", reference.editor);
  add("Edition", reference.edition);
  add("Series", reference.series);
  add("Address", reference.address);
  add("School", reference.school);
  add("Institution", reference.institution);
  add("Organization", reference.organization);
  add("How published", reference.howpublished);
  if (reference.citationCount !== undefined) add("Citations", reference.citationCount.toLocaleString());
  if (reference.doi) rows.push(["DOI", <span key="doi">{detailLink(`https://doi.org/${reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim()}`)}</span>]);
  add("PMID", reference.pmid);
  add("PMCID", reference.pmcid);
  const displayUrl = safeHttpUrl(reference.url);
  if (displayUrl && displayUrl !== link) rows.push(["URL", <span key="url">{detailLink(displayUrl)}</span>]);
  const filePath = reference.file?.trim() ? linkedFilePath(reference.file) : undefined;
  if (filePath) {
    // Same interaction as chat file mentions: the href carries the ?file=
    // param (so modifier-clicks still navigate) while a plain click opens
    // the tab in place via the workspace-file event.
    rows.push(["Linked file", (
      <span key="file">
        <Link
          href={`${pathname}?file=${encodeURIComponent(filePath)}`}
          className="break-all text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          scroll={false}
          title={`Open ${filePath}`}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            openWorkspaceEntry({ path: filePath });
            onNavigateAway?.();
          }}
        >
          {reference.file}
        </Link>
      </span>
    )]);
  }
  add("Accessed on", reference.urldate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {reference.sources?.map((source) => (
          <Badge key={source} variant="secondary">{source}</Badge>
        ))}
        {reference.type ? <Badge variant="secondary">{reference.type}</Badge> : null}
        {reference.isOpenAccess ? <Badge variant="outline">Open access</Badge> : null}
        {duplicateKey ? <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">Duplicate key</Badge> : null}
      </div>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {reference.abstract ? (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abstract</h4>
          <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/90">{reference.abstract}</p>
        </section>
      ) : null}
      {reference.keywords ? (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keywords</h4>
          <p className="text-xs leading-5">{reference.keywords}</p>
        </section>
      ) : null}
      {reference.note ? (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</h4>
          <p className="whitespace-pre-wrap text-xs leading-5">{reference.note}</p>
        </section>
      ) : null}
    </div>
  );
}
