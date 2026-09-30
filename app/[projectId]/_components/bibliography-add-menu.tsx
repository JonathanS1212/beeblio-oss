"use client";

import { useEffect, useRef, useState } from "react";
import { BookPlus, FileInput, FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadWorkspaceFile } from "@/lib/workspace-upload";
import {
  BIB_IMPORTS_DIRECTORY,
  PROJECT_BIBLIOGRAPHY_PATH,
  REFERENCES_DIRECTORY,
} from "@/lib/project-bibliography";
import { announceWorkspaceChange } from "@/lib/workspace-change";
import { dispatchWorkspaceMutation } from "@/lib/workspace-mutations";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { addBibliographyEntry, importBibliographyFile, importPaperCitation } from "../bibliography-actions";
import { ReferenceSheet, emptyReferenceDraft, type ReferenceDraft } from "./reference-sheet";
import type { PendingUpload } from "./use-pending-uploads";

export function BibliographyAddMenu({
  projectId,
  dropRequest,
  addPendingUpload,
  removePendingUpload,
}: {
  projectId: string;
  dropRequest?: { id: number; files: File[] };
  addPendingUpload: (folder: string, file: globalThis.File) => PendingUpload;
  removePendingUpload: (pending: PendingUpload) => void;
}) {
  const bibInputRef = useRef<HTMLInputElement>(null);
  const paperInputRef = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [doiFirst, setDoiFirst] = useState(false);
  const [manualDraft, setManualDraft] = useState<ReferenceDraft>();
  const [manualSaving, setManualSaving] = useState(false);
  const handledDropRef = useRef(0);

  const changed = (content?: string) => announceWorkspaceChange(
    content === undefined ? undefined : [{ path: PROJECT_BIBLIOGRAPHY_PATH, content }],
  );

  // A picked or dropped file first shows as a grayed pending row in the
  // Library list. A PDF's row resolves into the real one as soon as the file
  // lands in References — the citation lookup continues in the background —
  // while a BibTeX row stays up through the merge into the bibliography and
  // then disappears, since only the merged entries persist.
  const importFile = async (file: File, kind: "bib" | "paper") => {
    const pending = addPendingUpload(
      kind === "bib" ? BIB_IMPORTS_DIRECTORY : REFERENCES_DIRECTORY,
      file,
    );
    try {
      const uploadFile = kind === "bib"
        ? new File([file], `${crypto.randomUUID()}-${file.name}`, { type: file.type || "application/x-bibtex" })
        : file;
      const upload = await uploadWorkspaceFile(
        projectId,
        kind === "bib" ? BIB_IMPORTS_DIRECTORY : REFERENCES_DIRECTORY,
        uploadFile,
      );
      if (!upload.success) return toast.error("File upload failed", { description: upload.error });
      let bibliographyContent: string | undefined;
      if (kind === "paper") {
        dispatchWorkspaceMutation({ kind: "create", entry: upload.file });
        removePendingUpload(pending);
        const result = await importPaperCitation(projectId, upload.file.path);
        if (!result.success) return toast.error("Paper metadata was not added", { description: result.error });
        bibliographyContent = result.bibliographyContent;
        toast.success(result.added ? `Added “${result.title}”` : "This paper is already in the bibliography", {
          description: result.added ? `Metadata matched by ${result.matchedBy}. The PDF was saved to References.` : undefined,
        });
      } else {
        const result = await importBibliographyFile(projectId, upload.file.path);
        if (!result.success) return toast.error("BibTeX import failed", { description: result.error });
        bibliographyContent = result.bibliographyContent;
        toast.success(`${result.added} ${result.added === 1 ? "reference" : "references"} imported`, {
          description: result.skipped ? `${result.skipped} duplicate ${result.skipped === 1 ? "entry was" : "entries were"} skipped.` : undefined,
        });
      }
      changed(bibliographyContent);
    } finally {
      removePendingUpload(pending);
      if (kind === "bib" && bibInputRef.current) bibInputRef.current.value = "";
      if (kind === "paper" && paperInputRef.current) paperInputRef.current.value = "";
    }
  };

  // Imports mutate the shared bibliography, so batches run one at a time;
  // their pending rows still appear together the moment files arrive.
  const importFiles = async (files: File[], kind: "bib" | "paper") => {
    for (const file of files) await importFile(file, kind);
  };

  useEffect(() => {
    if (!dropRequest || handledDropRef.current === dropRequest.id) return;
    handledDropRef.current = dropRequest.id;
    void (async () => {
      for (const file of dropRequest.files) {
        await importFile(file, file.name.toLocaleLowerCase().endsWith(".bib") ? "bib" : "paper");
      }
    })();
  // Each drop request is handled once; recreating importFile must not replay it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropRequest]);

  const addManual = async (draft: ReferenceDraft) => {
    setManualSaving(true);
    try {
      const result = await addBibliographyEntry({ projectId, ...draft });
      if (!result.success) {
        toast.error("Reference could not be added", { description: result.error });
        return false;
      }
      toast.success(result.added ? "Reference added" : "This reference is already in the bibliography");
      setManualOpen(false);
      changed(result.bibliographyContent);
      return true;
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <>
      <input
        ref={bibInputRef}
        type="file"
        multiple
        accept=".bib,application/x-bibtex,text/plain"
        className="hidden"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          if (files.length) void importFiles(files, "bib");
        }}
      />
      <input
        ref={paperInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          if (files.length) void importFiles(files, "paper");
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-sm" variant="default" className="shrink-0 rounded-full" aria-label="Add to bibliography" title="Add to bibliography">
            <Plus />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => { setManualDraft(undefined); setDoiFirst(false); setManualOpen(true); }}>
            <BookPlus />
            <span>
              <span className="block">Input Manually</span>
              {/* <span className="block text-[10px] text-muted-foreground">Enter citation details</span> */}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setManualDraft(undefined); setDoiFirst(true); setManualOpen(true); }}>
            <Search />
            <span><span className="block">Add by DOI</span></span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setManualDraft({ ...emptyReferenceDraft, type: "online" }); setDoiFirst(false); setManualOpen(true); }}>
            <BookPlus />Web page
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setManualDraft({ ...emptyReferenceDraft, type: "online", howpublished: "YouTube video" }); setDoiFirst(false); setManualOpen(true); }}>
            <BookPlus />Video
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => bibInputRef.current?.click()}>
            <FileInput />
            <span>
              <span className="block">Import BibTeX</span>
              {/* <span className="block text-[10px] text-muted-foreground">Merge entries from a .bib file</span> */}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => paperInputRef.current?.click()}>
            <FileText />
            <span>
              <span className="block">Upload PDF</span>
              {/* <span className="block text-[10px] text-muted-foreground">Detect and add publication metadata</span> */}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReferenceSheet
        open={manualOpen}
        onOpenChange={(open) => { if (!manualSaving) setManualOpen(open); }}
        mode="edit"
        initialDraft={manualDraft}
        projectId={projectId}
        doiLookup
        autoFocusDoi={doiFirst}
        saveLabel="Add Reference"
        saving={manualSaving}
        onSave={addManual}
      />
    </>
  );
}
