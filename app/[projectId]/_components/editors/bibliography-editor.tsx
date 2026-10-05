"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, BookOpen, Code2, Columns2, Eye, LayoutList, Loader2, Network, Plus, Quote, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  parseBibtexEntries,
  removeBibtexEntry,
  splitBibtexAuthors,
  type BibtexEntry,
} from "@/lib/bibtex";
import { announceWorkspaceChange } from "@/lib/workspace-change";
import type { MatrixCitationEntry } from "@/lib/literature-matrix";
import {
  LIBRARY_REFERENCE_FOCUS_EVENT,
  takePendingLibraryFocus,
  type LibraryReferenceFocusDetail,
} from "@/lib/library-focus";
import { PROJECT_BIBLIOGRAPHY_PATH } from "@/lib/project-bibliography";
import { usePublicView } from "@/app/share/[shareId]/_components/public-view-context";
import { ReferenceSheet, type ReferenceDetail, type ReferenceDraft } from "../reference-sheet";
import { draftFromBibtexEntry, updateBibtexSourceWithDraft } from "../reference-bibtex";
import { MatrixTargetDialog, useMatrixAdd } from "../matrix-add";
import { rememberCitationMatrixPaths } from "../matrix-membership-cache";
import { addBibliographyEntry } from "../../bibliography-actions";
import { getCitationMatrixLocations } from "../../matrix-actions";
import { EditorShell } from "./editor-shell";
import { EditorError, EditorLoading } from "./editor-states";
import { SourceCodeEditor } from "./source-code-editor";
import { extensionOf, type WorkspaceEditorProps } from "./types";
import { useTextFile } from "./use-text-file";
import { LiteratureMap } from "./literature-map/literature-map";

type Citation = {
  id: string;
  order: number;
  type?: string;
  title?: string;
  authors?: string;
  year?: string;
  date?: string;
  container?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
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
  citationCount?: number;
  bibtex?: BibtexEntry;
};
type Author = { family: string; given: string };
type BibliographyMode = "preview" | "source" | "split";
type BibliographyView = "cards" | "map" | "apa" | "vancouver" | "chicago" | "chicago-notes" | "mla" | "ieee" | "harvard";

const viewLabels: Record<BibliographyView, string> = {
  cards: "Cards",
  map: "Map",
  apa: "APA 7",
  vancouver: "Vancouver",
  chicago: "Chicago",
  "chicago-notes": "Chicago Notes & Bibliography",
  mla: "MLA 9",
  ieee: "IEEE",
  harvard: "Harvard Cite Them Right",
};

export function BibliographyEditor({ projectId, file, sourceUrl, onSaved }: WorkspaceEditorProps) {
  const isPublicRoute = Boolean(usePublicView().shareId);
  const text = useTextFile(projectId, file.path, onSaved);
  const [mode, setMode] = useState<BibliographyMode>("preview");
  const [view, setView] = useState<BibliographyView>("cards");
  const [query, setQuery] = useState("");
  const [detailCitation, setDetailCitation] = useState<Citation>();
  const [detailEditing, setDetailEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Citation>();
  const [newReferenceOpen, setNewReferenceOpen] = useState(false);
  const [newReferenceSaving, setNewReferenceSaving] = useState(false);
  const extension = extensionOf(file.name);
  const citations = useMemo(() => extension === "bib" ? parseBibtex(text.draft) : parseRis(text.draft), [extension, text.draft]);
  const duplicateIds = useMemo(() => new Set(citations.filter((citation, index) => citations.findIndex((item) => item.id === citation.id) !== index).map((citation) => citation.id)), [citations]);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = citations.filter((citation) => !normalizedQuery || [citation.id, citation.type, citation.title, citation.authors, citation.container, citation.publisher, citation.year, citation.doi].some((value) => value?.toLowerCase().includes(normalizedQuery)));
  const [savedMatrixKeys, setSavedMatrixKeys] = useState<Set<string>>(new Set());
  const initialMatrixSyncSignatureRef = useRef<string | undefined>(undefined);

  const syncSavedMatrixState = useCallback(async (currentCitations: Citation[]) => {
    if (isPublicRoute) return;
    try {
      const result = await getCitationMatrixLocations({
        projectId,
        entries: currentCitations.map((c) => ({ citationKey: c.id, doi: c.doi })),
      });
      rememberCitationMatrixPaths(projectId, result.paths);
      const keys = new Set<string>();
      for (const [key, paths] of Object.entries(result.paths)) {
        if (paths.length > 0) keys.add(key);
      }
      setSavedMatrixKeys(keys);
    } catch {
      // Ignore
    }
  }, [projectId, isPublicRoute]);

  useEffect(() => {
    const signature = citations.map(({ id, doi }) => `${id}\u0000${doi ?? ""}`).join("\u0001");
    if (initialMatrixSyncSignatureRef.current === signature) return;
    initialMatrixSyncSignatureRef.current = signature;
    void syncSavedMatrixState(citations);
  }, [citations, syncSavedMatrixState]);

  useEffect(() => {
    const onChange = () => void syncSavedMatrixState(citations);
    window.addEventListener("beeblio:workspace-changed", onChange);
    return () => window.removeEventListener("beeblio:workspace-changed", onChange);
  }, [citations, syncSavedMatrixState]);

  // Quick Open can hand this editor a specific citation to land on — a library
  // pick, or an online result that was just saved into references.bib. The
  // wanted key may arrive before the text has parsed (or, via the pending
  // hand-off, before this editor even mounts), so it stays in a ref and
  // retries as the citations (re)parse.
  const focusTargetRef = useRef<string | null>(null);
  const focusCitation = useCallback((citationKey: string) => {
    const citation = citations.find((candidate) => candidate.id === citationKey);
    if (!citation) return;
    focusTargetRef.current = null;
    setQuery(citationKey);
    setDetailEditing(false);
    setDetailCitation(citation);
  }, [citations]);

  // On mount, take the pick the quick-open palette staged before opening this
  // file; an event dispatched pre-mount would have been missed.
  useEffect(() => {
    if (file.path !== PROJECT_BIBLIOGRAPHY_PATH) return;
    const pending = takePendingLibraryFocus();
    if (pending?.citationKey) focusTargetRef.current = pending.citationKey;
  }, [file.path]);

  useEffect(() => {
    if (file.path !== PROJECT_BIBLIOGRAPHY_PATH) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LibraryReferenceFocusDetail>).detail;
      if (!detail?.citationKey) return;
      focusTargetRef.current = detail.citationKey;
      focusCitation(detail.citationKey);
    };
    window.addEventListener(LIBRARY_REFERENCE_FOCUS_EVENT, handler);
    return () => window.removeEventListener(LIBRARY_REFERENCE_FOCUS_EVENT, handler);
  }, [file.path, focusCitation]);

  // Retries: applies once citations include the key — after the initial load,
  // or after a reload event brings in a freshly saved entry.
  useEffect(() => {
    if (!focusTargetRef.current) return;
    focusCitation(focusTargetRef.current);
  }, [focusCitation]);

  const updateCitation = async (citation: Citation, draft: ReferenceDraft) => {
    if (!citation.bibtex) return false;
    if (!draft.key.trim() || !draft.type.trim()) {
      toast.error("Citation key and type are required.");
      return false;
    }
    if (draft.key !== citation.id && citations.some((item) => item.id === draft.key)) {
      toast.error("That citation key is already in use.");
      return false;
    }

    const next = updateBibtexSourceWithDraft(text.draft, citation.bibtex, draft);
    const saved = await text.save(next);
    if (saved) {
      setDetailEditing(false);
      setDetailCitation(undefined);
    }
    return saved;
  };

  const deleteCitation = async () => {
    if (!deleteTarget?.bibtex) return;
    const next = removeBibtexEntry(text.draft, deleteTarget.bibtex);
    const saved = await text.save(next);
    if (saved) {
      if (detailCitation?.id === deleteTarget.id) {
        setDetailCitation(undefined);
        setDetailEditing(false);
      }
      setDeleteTarget(undefined);
    }
  };

  // "+ New": the Literature panel's manual/DOI add, available inside the
  // bibliography editor. The blank ReferenceSheet saves through the same
  // addBibliographyEntry server action the panel uses; the announced content
  // flows back into this editor — clean drafts update in place, dirty ones go
  // through the existing proposal flow.
  const openNewReference = () => {
    setDetailCitation(undefined);
    setDetailEditing(false);
    setNewReferenceOpen(true);
  };

  const addReference = async (draft: ReferenceDraft) => {
    setNewReferenceSaving(true);
    try {
      const result = await addBibliographyEntry({ projectId, ...draft });
      if (!result.success) {
        toast.error("Reference could not be added", { description: result.error });
        return false;
      }
      toast.success(result.added ? "Reference added" : "This reference is already in the bibliography");
      setNewReferenceOpen(false);
      announceWorkspaceChange([{ path: file.path, content: result.bibliographyContent }]);
      return true;
    } finally {
      setNewReferenceSaving(false);
    }
  };

  const matrixAdd = useMatrixAdd(projectId, undefined, !isPublicRoute);
  const addCitationToMatrix = (citation: Citation) => {
    const year = citation.year?.match(/\d{4}/)?.[0];
    const entry: MatrixCitationEntry = {
      citationKey: citation.id,
      doi: citation.doi || undefined,
      title: citation.title || undefined,
      authors: citation.authors || undefined,
      year: year ? Number(year) : undefined,
      venue: citation.container || undefined,
    };
    matrixAdd.add({ kind: "citations", entries: [entry] });
  };

  const browser = <CitationBrowser projectId={projectId} filePath={file.path} citations={visible} duplicateIds={duplicateIds} query={query} onQueryChange={setQuery} view={view} onViewChange={setView} compact={mode === "split"} readOnly={isPublicRoute} onAdd={!isPublicRoute && file.path === PROJECT_BIBLIOGRAPHY_PATH ? openNewReference : undefined} onOpen={(citation) => { setDetailEditing(false); setDetailCitation(citation); }} />;

  return <EditorShell path={file.path} sourceUrl={sourceUrl} dirty={text.dirty} status={<span className="text-xs text-muted-foreground mr-2">{extension === "bib" ? "BibTeX" : "RIS"} · {citations.length} References{duplicateIds.size ? ` · ${duplicateIds.size} duplicate keys` : ""}</span>} viewModes={[{
    value: mode,
    onChange: (value) => setMode(value as "preview" | "source" | "split"),
    options: [
      { value: "preview", label: "References preview", icon: Eye },
      { value: "source", label: isPublicRoute ? "View source" : "Edit source", icon: Code2 },
      { value: "split", label: "Split source and preview", icon: Columns2 },
    ],
  }]} discard={{ onDiscard: text.discard, disabled: text.saving }} save={{ onClick: () => text.save(), saving: text.saving, disabled: duplicateIds.size > 0 }} review={text.review}>
    {text.loading ? <EditorLoading name={file.name} size={file.size} /> : text.error ? <EditorError message={text.error} /> : mode === "source" ? <BibliographySource value={text.draft} extension={extension} onChange={text.setDraft} readOnly={isPublicRoute} /> : mode === "split" ? <div className="grid h-full min-h-0 grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1"><div className="min-h-0 border-r"><BibliographySource value={text.draft} extension={extension} onChange={text.setDraft} readOnly={isPublicRoute} /></div>{browser}</div> : browser}
    <ReferenceSheet
      open={Boolean(detailCitation)}
      onOpenChange={(open) => { if (!open && !text.saving && !deleteTarget) { setDetailCitation(undefined); setDetailEditing(false); } }}
      mode={detailEditing ? "edit" : "preview"}
      projectId={isPublicRoute ? undefined : projectId}
      reference={detailCitation ? citationToReference(detailCitation) : undefined}
      initialDraft={detailCitation?.bibtex ? draftFromBibtexEntry(detailCitation.bibtex) : undefined}
      requireKey
      saving={text.saving}
      duplicateKey={detailCitation ? duplicateIds.has(detailCitation.id) : false}
      onEdit={!isPublicRoute && extension === "bib" ? () => setDetailEditing(true) : undefined}
      onCancelEdit={() => setDetailEditing(false)}
      onSave={(draft) => detailCitation ? updateCitation(detailCitation, draft) : Promise.resolve(false)}
      onDelete={!isPublicRoute && extension === "bib" ? () => {
        if (detailCitation) setDeleteTarget(detailCitation);
      } : undefined}
      onAddToMatrix={!isPublicRoute && detailCitation ? () => addCitationToMatrix(detailCitation) : undefined}
      addingToMatrix={matrixAdd.saving}
      matrixSaved={detailCitation ? savedMatrixKeys.has(detailCitation.id) : false}
    />
    {!isPublicRoute && <ReferenceSheet
      open={newReferenceOpen}
      onOpenChange={(open) => { if (!open && !newReferenceSaving) setNewReferenceOpen(false); }}
      mode="edit"
      projectId={projectId}
      doiLookup
      saveLabel="Add Reference"
      saving={newReferenceSaving}
      onSave={addReference}
    />}
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !text.saving) setDeleteTarget(undefined); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this reference?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{deleteTarget?.title || deleteTarget?.id}</span>{" "}
            will be permanently removed from references.bib.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={text.saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={text.saving} onClick={(event) => { event.preventDefault(); void deleteCitation(); }}>
            {text.saving ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {text.saving ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <MatrixTargetDialog
      projectId={projectId}
      open={matrixAdd.pickerOpen}
      targets={matrixAdd.targets}
      saving={matrixAdd.saving}
      savingPath={matrixAdd.savingPath}
      memberPaths={matrixAdd.memberPaths}
      onCancel={matrixAdd.cancel}
      onPick={matrixAdd.pick}
    />
  </EditorShell>;
}

function BibliographySource({ value, extension, onChange, readOnly = false }: { value: string; extension: string; onChange: (value: string) => void; readOnly?: boolean }) {
  return <div className="flex h-full min-h-0 flex-col"><div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/50 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>{extension === "bib" ? "BibTeX" : "RIS"} source</span><span>{value.split("\n").length} lines</span></div><SourceCodeEditor value={value} extension={extension} onChange={onChange} readOnly={readOnly} /></div>;
}

function CitationBrowser({ projectId, filePath, citations, duplicateIds, query, onQueryChange, view, onViewChange, onAdd, onOpen, compact = false, readOnly = false }: { projectId: string; filePath: string; citations: Citation[]; duplicateIds: Set<string>; query: string; onQueryChange: (value: string) => void; view: BibliographyView; onViewChange: (value: BibliographyView) => void; onAdd?: () => void; onOpen: (citation: Citation) => void; compact?: boolean; readOnly?: boolean }) {
  return <div className="flex h-full min-h-0 flex-col bg-muted/20">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card p-3">
      <div className="relative min-w-48 flex-1"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search title, author, year, or key" className="h-8 pl-8 text-xs selection:bg-primary/20 selection:text-foreground dark:selection:bg-primary/35 dark:selection:text-foreground" /></div>
      <Select value={view} onValueChange={(value) => onViewChange(value as BibliographyView)}><SelectTrigger size="sm" className="h-8 min-w-40 rounded-lg px-2.5 text-xs" aria-label="Bibliography display format"><SelectValue /></SelectTrigger><SelectContent align="end"><SelectItem className="text-xs" value="cards"><LayoutList />Cards</SelectItem><SelectItem className="text-xs" value="map"><Network />Map</SelectItem><SelectItem className="text-xs" value="apa"><Quote />APA 7</SelectItem><SelectItem className="text-xs" value="chicago"><Quote />Chicago</SelectItem><SelectItem className="text-xs" value="chicago-notes"><Quote />Chicago Notes & Bibliography</SelectItem><SelectItem className="text-xs" value="harvard"><Quote />Cite Them Right Harvard</SelectItem><SelectItem className="text-xs" value="mla"><Quote />MLA 9</SelectItem><SelectItem className="text-xs" value="ieee"><Quote />IEEE</SelectItem><SelectItem className="text-xs" value="vancouver"><Quote />Vancouver</SelectItem></SelectContent></Select>
      {onAdd ? (
        <Button type="button" size="sm" className="h-8 shrink-0 gap-1.5 rounded-lg" onClick={onAdd} aria-label="Add a new reference" title="Add a new reference">
          <Plus className="size-3.5" />
          New
        </Button>
      ) : null}
      <span className="shrink-0 text-xs text-muted-foreground">{citations.length} Shown</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-3">
      {view === "cards" ? <div className={compact ? "space-y-2" : "grid gap-3 lg:grid-cols-2"}>{citations.map((citation) => <CitationCard key={`${citation.id}:${citation.order}`} citation={citation} duplicate={duplicateIds.has(citation.id)} onOpen={onOpen} />)}</div> : view === "map" ? <div className="h-full min-h-[28rem]"><LiteratureMap projectId={projectId} filePath={filePath} citations={citations} allowEnrichment={!readOnly} onOpen={(id) => { const citation = citations.find((item) => item.id === id); if (citation) onOpen(citation); }} /></div> : <StyledBibliography citations={citations} style={view} onOpen={onOpen} />}
      {citations.length === 0 ? <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground"><BookOpen className="size-7 opacity-50" /><p className="text-sm font-medium">No references found</p><p className="text-xs">Try another search or edit the source.</p></div> : null}
    </div>
  </div>;
}

function CitationCard({ citation, duplicate, onOpen }: { citation: Citation; duplicate: boolean; onOpen: (citation: Citation) => void }) {
  const url = safeCitationUrl(citation.url);
  return <article className={`relative cursor-pointer rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/30 ${duplicate ? "border-amber-500/60" : ""}`} onClick={() => onOpen(citation)}>
    {url ? <Button asChild size="icon-sm" variant="ghost" className="absolute right-2 top-2" title="Open reference URL"><a href={url} target="_blank" rel="noreferrer" aria-label={`Open URL for ${citation.title || citation.id}`} onClick={(event) => event.stopPropagation()}><ArrowUpRight /></a></Button> : null}
    <div className="flex items-start gap-3 pr-7">{duplicate ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />}<div className="min-w-0 flex-1"><div className="mb-2 flex items-center gap-2"><span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">{citation.type || "reference"}</span>{citation.year ? <span className="text-[11px] text-muted-foreground">{citation.year}</span> : null}{duplicate ? <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">Duplicate key</span> : null}</div><h3 className="text-sm font-semibold leading-5">{citation.title || "Untitled reference"}</h3>{citation.authors ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{citation.authors}</p> : null}{citation.container ? <p className="mt-1 line-clamp-1 text-[11px] italic text-muted-foreground">{citation.container}</p> : null}</div></div>
  </article>;
}

function StyledBibliography({ citations, style, onOpen }: { citations: Citation[]; style: Exclude<BibliographyView, "cards">; onOpen: (citation: Citation) => void }) {
  const ordered = style === "vancouver" || style === "ieee" ? citations : [...citations].sort((left, right) => citationSortKey(left).localeCompare(citationSortKey(right)));
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="grid grid-cols-[minmax(7.5rem,0.24fr)_minmax(0,1fr)] border-b bg-muted/45 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><div className="border-r px-3 py-2.5">{style === "chicago-notes" ? "Note marker" : "In-text"}</div><div className="px-4 py-2.5">{style === "mla" ? "MLA 9 works cited" : `${viewLabels[style]} reference list`}</div></div>
    <div className="divide-y">{ordered.map((citation) => <article key={`${citation.id}:${citation.order}`} className="grid cursor-pointer grid-cols-[minmax(7.5rem,0.24fr)_minmax(0,1fr)] transition-colors hover:bg-muted/40" onClick={() => onOpen(citation)}><div className="border-r bg-muted/15 px-3 py-4 text-xs font-medium leading-5">{formatInText(citation, style)}</div><div className="min-w-0 px-9 py-4 pr-14 font-serif text-[13px] leading-6 [text-indent:-1.25rem]">{formatEntry(citation, style)}</div></article>)}</div>
  </section>;
}

function formatInText(citation: Citation, style: Exclude<BibliographyView, "cards">) {
  if (style === "vancouver") return `(${citation.order})`;
  if (style === "ieee") return `[${citation.order}]`;
  if (style === "chicago-notes") return <sup className="text-[0.8em]">{citation.order}</sup>;
  const authors = parseAuthors(citation.authors || citation.organization);
  if (style === "mla") return `(${inTextAuthor(authors, citation.title)})`;
  const author = inTextAuthor(authors, citation.title, style === "apa");
  return style === "apa" || style === "harvard" ? `(${author}, ${yearOf(citation.year)})` : `(${author} ${yearOf(citation.year)})`;
}

function formatEntry(citation: Citation, style: Exclude<BibliographyView, "cards">): ReactNode {
  const authors = parseAuthors(citation.authors || citation.organization);
  const title = clean(citation.title || "Untitled reference");
  const year = yearOf(citation.year);
  const link = citationLink(citation);
  const book = /book|thesis|dissertation|report|manual/i.test(citation.type || "");
  if (style === "ieee") return formatIeeeEntry(citation, authors, title, year, link, book);
  if (style === "mla") return formatMlaEntry(citation, authors, title, year, link, book);
  if (style === "harvard") return formatHarvardEntry(citation, authors, title, year, link, book);
  if (style === "chicago-notes") return formatChicagoNotesEntry(citation, authors, title, year, link, book);
  if (style === "apa") return <>{formatApaAuthors(authors) ? `${formatApaAuthors(authors)} ` : ""}({year}). {book ? <><em>{title}</em>.</> : `${title}.`} {!book && citation.container ? <em>{clean(citation.container)}</em> : null}{!book && citation.volume ? <>, <em>{citation.volume}</em></> : null}{!book && citation.issue ? `(${citation.issue})` : null}{citation.pages ? `, ${pages(citation.pages)}` : null}{!book ? "." : null}{book && citation.publisher ? ` ${clean(citation.publisher)}.` : null}{link ? <> <CitationLink href={link} /></> : null}</>;
  if (style === "vancouver") return <>{formatVancouverAuthors(authors) ? `${formatVancouverAuthors(authors)}. ` : ""}{title}. {citation.container || citation.publisher ? `${clean(citation.container || citation.publisher || "")}. ` : ""}{year}{citation.volume ? `;${citation.volume}` : ""}{citation.issue ? `(${citation.issue})` : ""}{citation.pages ? `:${pages(citation.pages)}` : ""}.{link ? <> <CitationLink href={link} /></> : null}</>;
  return <>{formatChicagoAuthors(authors) ? `${formatChicagoAuthors(authors)}. ` : ""}{year}. {book ? <><em>{title}</em>.</> : `“${title}.”`} {!book && citation.container ? <em>{clean(citation.container)}</em> : null}{!book && citation.volume ? ` ${citation.volume}` : null}{!book && citation.issue ? ` (${citation.issue})` : null}{citation.pages ? `: ${pages(citation.pages)}` : null}{!book ? "." : null}{book && citation.publisher ? ` ${clean(citation.publisher)}.` : null}{link ? <> <CitationLink href={link} /></> : null}</>;
}

function formatIeeeEntry(citation: Citation, authors: Author[], title: string, year: string, link: string | undefined, book: boolean): ReactNode {
  const authorText = formatIeeeAuthors(authors);
  if (book) return <>[{citation.order}] {authorText ? `${authorText}, ` : ""}<em>{title}</em>. {citation.publisher ? `${clean(citation.publisher)}, ` : ""}{year}.{link ? <> <CitationLink href={link} /></> : null}</>;
  return <>[{citation.order}] {authorText ? `${authorText}, ` : ""}“{title},” {citation.container ? <><em>{clean(citation.container)}</em>, </> : null}{citation.volume ? `vol. ${citation.volume}, ` : ""}{citation.issue ? `no. ${citation.issue}, ` : ""}{citation.pages ? `pp. ${pages(citation.pages)}, ` : ""}{year}.{link ? <> <CitationLink href={link} /></> : null}</>;
}

function formatMlaEntry(citation: Citation, authors: Author[], title: string, year: string, link: string | undefined, book: boolean): ReactNode {
  const authorText = formatChicagoAuthors(authors);
  if (book) return <>{authorText ? `${authorText}. ` : ""}<em>{title}</em>. {citation.publisher ? `${clean(citation.publisher)}, ` : ""}{year}.{link ? <> <CitationLink href={link} /></> : null}</>;
  return <>{authorText ? `${authorText}. ` : ""}“{title}.” {citation.container ? <><em>{clean(citation.container)}</em>, </> : null}{citation.volume ? `vol. ${citation.volume}, ` : ""}{citation.issue ? `no. ${citation.issue}, ` : ""}{year}{citation.pages ? `, pp. ${pages(citation.pages)}` : ""}.{link ? <> <CitationLink href={link} /></> : null}</>;
}

function formatHarvardEntry(citation: Citation, authors: Author[], title: string, year: string, link: string | undefined, book: boolean): ReactNode {
  const authorText = formatHarvardAuthors(authors);
  if (book) return <>{authorText ? `${authorText} ` : ""}({year}) <em>{title}</em>. {citation.publisher ? `${clean(citation.publisher)}.` : ""}{link ? <> Available at: <CitationLink href={link} /></> : null}</>;
  return <>{authorText ? `${authorText} ` : ""}({year}) ‘{title}’, {citation.container ? <><em>{clean(citation.container)}</em>, </> : null}{citation.volume || citation.issue ? `${citation.volume || ""}${citation.issue ? `(${citation.issue})` : ""}` : ""}{citation.pages ? `, pp. ${pages(citation.pages)}` : ""}.{link ? <> Available at: <CitationLink href={link} /></> : null}</>;
}

function formatChicagoNotesEntry(citation: Citation, authors: Author[], title: string, year: string, link: string | undefined, book: boolean): ReactNode {
  const authorText = formatChicagoAuthors(authors);
  if (book) return <>{authorText ? `${authorText}. ` : ""}<em>{title}</em>. {citation.publisher ? `${clean(citation.publisher)}, ` : ""}{year}.{link ? <> <CitationLink href={link} /></> : null}</>;
  return <>{authorText ? `${authorText}. ` : ""}“{title}.” {citation.container ? <em>{clean(citation.container)}</em> : null}{citation.volume ? ` ${citation.volume}` : ""}{citation.issue ? `, no. ${citation.issue}` : ""} ({year}){citation.pages ? `: ${pages(citation.pages)}` : ""}.{link ? <> <CitationLink href={link} /></> : null}</>;
}

function CitationLink({ href }: { href: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="break-all text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">{href}</a>;
}

function parseAuthors(value?: string): Author[] {
  if (!value) return [];
  return splitBibtexAuthors(value).map((name) => {
    if (name.includes(",")) { const [family, ...given] = name.split(",").map((part) => part.trim()); return { family, given: given.join(" ") }; }
    const parts = name.split(/\s+/); return { family: parts.at(-1) || name, given: parts.slice(0, -1).join(" ") };
  });
}

function inTextAuthor(authors: Author[], title?: string, ampersand = false) {
  if (!authors.length) return `“${clean(title || "Untitled").split(/\s+/).slice(0, 4).join(" ")}”`;
  if (authors.length === 1) return authors[0].family;
  if (authors.length === 2) return `${authors[0].family} ${ampersand ? "&" : "and"} ${authors[1].family}`;
  return `${authors[0].family} et al.`;
}

function initials(value: string, periods: boolean) { return value.split(/[\s-]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() || ""}${periods ? "." : ""}`).join(periods ? " " : ""); }
function formatApaAuthors(authors: Author[]) { const list = authors.map((author) => `${author.family}${author.given ? `, ${initials(author.given, true)}` : ""}`); return joinAuthors(list, "&"); }
function formatVancouverAuthors(authors: Author[]) { return authors.map((author) => `${author.family}${author.given ? ` ${initials(author.given, false)}` : ""}`).join(", "); }
function formatChicagoAuthors(authors: Author[]) { const list = authors.map((author, index) => index ? `${author.given ? `${author.given} ` : ""}${author.family}` : `${author.family}${author.given ? `, ${author.given}` : ""}`); return joinAuthors(list, "and"); }
function formatHarvardAuthors(authors: Author[]) { return joinAuthors(authors.map((author) => `${author.family}${author.given ? `, ${initials(author.given, true)}` : ""}`), "and"); }
function formatIeeeAuthors(authors: Author[]) { return joinAuthors(authors.map((author) => `${author.given ? `${initials(author.given, true)} ` : ""}${author.family}`), "and"); }
function joinAuthors(list: string[], conjunction: string) { if (list.length < 2) return list[0] || ""; return `${list.slice(0, -1).join(", ")}${list.length > 2 ? "," : ""} ${conjunction} ${list.at(-1)}`; }
function citationSortKey(citation: Citation) { return `${parseAuthors(citation.authors)[0]?.family || citation.title || citation.id} ${yearOf(citation.year)} ${citation.title || ""}`; }
function yearOf(value?: string) { return value?.match(/\d{4}/)?.[0] || "n.d."; }
function pages(value: string) { return value.replaceAll("--", "–").replaceAll(/\s*-\s*/g, "–"); }
function clean(value: string) { return value.trim().replace(/[.,;:]+$/, ""); }

function citationLink(citation: Citation) {
  const doi = citation.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  return safeCitationUrl(doi ? `https://doi.org/${doi}` : citation.url);
}

function safeCitationUrl(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}

function citationToReference(citation: Citation): ReferenceDetail {
  return {
    title: citation.title || "Untitled reference",
    authors: citation.authors,
    type: citation.type,
    key: citation.id,
    year: citation.year,
    date: citation.date,
    container: citation.container,
    publisher: citation.publisher,
    volume: citation.volume,
    issue: citation.issue,
    pages: citation.pages,
    doi: citation.doi,
    url: citation.url,
    abstract: citation.abstract,
    keywords: citation.keywords,
    note: citation.note,
    file: citation.file,
    month: citation.month,
    editor: citation.editor,
    edition: citation.edition,
    series: citation.series,
    address: citation.address,
    school: citation.school,
    institution: citation.institution,
    organization: citation.organization,
    howpublished: citation.howpublished,
    urldate: citation.urldate,
  };
}

function parseBibtex(source: string): Citation[] {
  return parseBibtexEntries(source).map((entry, index) => {
    const fields = Object.fromEntries(Object.entries(entry.fields).map(([name, value]) => [name, value.replaceAll(/\s+/g, " ").trim()]));
    return {
      id: entry.key,
      order: index + 1,
      type: entry.type,
      title: fields.title,
      authors: fields.author,
      year: fields.year || fields.date?.slice(0, 4),
      date: fields.date,
      container: fields.journal || fields.booktitle,
      publisher: fields.publisher,
      volume: fields.volume,
      issue: fields.number || fields.issue,
      pages: fields.pages,
      doi: fields.doi,
      url: fields.url,
      abstract: fields.abstract,
      keywords: fields.keywords,
      note: fields.note,
      file: fields.file,
      month: fields.month,
      editor: fields.editor,
      edition: fields.edition,
      series: fields.series,
      address: fields.address,
      school: fields.school,
      institution: fields.institution,
      organization: fields.organization,
      howpublished: fields.howpublished,
      urldate: fields.urldate,
      citationCount: /^\d+$/.test(fields.citationcount || "") ? Number(fields.citationcount) : undefined,
      bibtex: entry,
    };
  });
}

function parseRis(source: string): Citation[] {
  return source.split(/^ER\s*-\s*$/m).map((block, index) => {
    const fields = new Map<string, string[]>();
    block.split(/\r?\n/).forEach((line) => { const match = line.match(/^([A-Z0-9]{2})\s*-\s*(.*)$/); if (match) fields.set(match[1], [...(fields.get(match[1]) || []), match[2]]); });
    const start = fields.get("SP")?.[0]; const end = fields.get("EP")?.[0];
    return { id: fields.get("ID")?.[0] || `reference-${index}`, order: index + 1, type: fields.get("TY")?.[0], title: fields.get("TI")?.[0] || fields.get("T1")?.[0], authors: fields.get("AU")?.join("; "), year: fields.get("PY")?.[0] || fields.get("Y1")?.[0], container: fields.get("JO")?.[0] || fields.get("JF")?.[0] || fields.get("T2")?.[0], publisher: fields.get("PB")?.[0], volume: fields.get("VL")?.[0], issue: fields.get("IS")?.[0], pages: start ? `${start}${end ? `-${end}` : ""}` : undefined, doi: fields.get("DO")?.[0], url: fields.get("UR")?.[0] || fields.get("L1")?.[0], abstract: fields.get("AB")?.[0] || fields.get("N2")?.[0], keywords: fields.get("KW")?.join(", ") || undefined, note: fields.get("N1")?.[0] };
  }).filter((citation) => citation.title || citation.authors);
}
