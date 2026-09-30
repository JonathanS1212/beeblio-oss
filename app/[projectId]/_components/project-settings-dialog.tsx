"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CITATION_STYLES, formatCitation, type CitationReference } from "@/lib/citations";
import {
  COMPLETION_CITATIONS_FILTERS,
  COMPLETION_SETTINGS_CHANGED_EVENT,
  DEFAULT_COMPLETION_SETTINGS,
  DEFAULT_DOCUMENT_SETTINGS,
  DOCUMENT_FONT_FAMILIES,
  DOCUMENT_FONT_SIZES,
  documentFontFamilyCss,
  isMarkdownFilePath,
  isBibFilePath,
  type CompletionSettings,
  type CompletionYearFilter,
  type DocumentDefaultSettings,
  type ProjectSettings,
} from "@/lib/project-settings";
import { cn } from "@/lib/utils";
import { listAllFiles } from "../file-actions";
import {
  clearProjectDefaultOpenFile,
  getProjectDetails,
  saveProjectCompletionSettings,
  saveProjectDefaultOpenFile,
  saveProjectDocumentDefaults,
  saveProjectDetails,
  saveProjectIncludeSystemSkills,
} from "../settings-actions";
import { notifyUpcomingFeature } from "./upcoming-feature";

const PREVIEW_REFERENCE: CitationReference = {
  id: "sample",
  type: "article",
  title: "A sample research finding",
  authors: "Morgan, Alex and Lee, Sam",
  year: "2026",
  container: "Journal of Research",
  publisher: "",
  volume: "",
  issue: "",
  pages: "",
  doi: "",
  url: "",
  abstract: "",
  isOpenAccess: false,
};

/** Sections of the settings dialog, in tab order. */
type SettingsTab = "general" | "formatting" | "completion";

/**
 * Project preferences dialog: the project's name and description, the default
 * file opened when the project loads without a ?file= param, the document
 * style defaults, the sentence auto-completion configuration (sources and
 * quality filters) used by the document editor, and the BYOK model setup.
 *
 * Current values come from initialSettings (layout props, kept fresh by the
 * save actions' revalidatePath), so opening costs no settings round trip;
 * only the file suggestion lists are fetched, non-blocking. Entries without
 * layout props (the editor's completion button) fall back to fetching the
 * project details the same way.
 */
export function ProjectSettingsDialog({
  projectId,
  open,
  onOpenChange,
  initialSettings,
  initialName,
  initialDescription,
  resolvedDefaultFile,
  initialTab = "general",
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSettings?: ProjectSettings;
  initialName?: string;
  initialDescription?: string;
  /** What actually opens on a bare load (saved setting or automatic pick). */
  resolvedDefaultFile?: string;
  initialTab?: SettingsTab;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [defaultFile, setDefaultFile] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [documentDefaults, setDocumentDefaults] = useState<DocumentDefaultSettings>(DEFAULT_DOCUMENT_SETTINGS);
  const [completion, setCompletion] = useState<CompletionSettings>(DEFAULT_COMPLETION_SETTINGS);
  const [includeSystemSkills, setIncludeSystemSkills] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>();
  const [bibFiles, setBibFiles] = useState<string[]>();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Latest-prop refs: the open effect below must read the freshest settings
  // without listing them as deps (a revalidate while the dialog is open must
  // not reset in-progress edits).
  const initialSettingsRef = useRef(initialSettings);
  initialSettingsRef.current = initialSettings;
  const initialNameRef = useRef(initialName);
  initialNameRef.current = initialName;
  const initialDescriptionRef = useRef(initialDescription);
  initialDescriptionRef.current = initialDescription;
  const bibFilesRef = useRef<string[]>([]);
  bibFilesRef.current = bibFiles ?? [];

  const query = defaultFile.trim().toLocaleLowerCase();
  const matches = (suggestions || [])
    .filter((path) => path.toLocaleLowerCase().includes(query))
    .slice(0, 8);
  const highlighted = Math.min(activeIndex, Math.max(0, matches.length - 1));
  // The configured library may have been deleted since it was saved; keep it
  // selectable so the user sees what is set instead of a silent reset.
  const libraryOptions = bibFilesRef.current.includes(completion.sources.libraryPath)
    ? bibFilesRef.current
    : [completion.sources.libraryPath, ...bibFilesRef.current];

  useEffect(() => {
    if (!open) return;
    // Reset from the latest layout-provided settings: reopening discards
    // cancelled edits and picks up whatever the last save revalidated.
    const current = initialSettingsRef.current;
    setActiveTab(initialTab);
    setDefaultFile(current?.defaultOpenFile ?? "");
    setName(initialNameRef.current ?? "");
    setDescription(initialDescriptionRef.current ?? "");
    setDocumentDefaults(current?.documentDefaults ?? DEFAULT_DOCUMENT_SETTINGS);
    setCompletion(current?.completion ?? DEFAULT_COMPLETION_SETTINGS);
    setIncludeSystemSkills(current?.includeSystemSkills ?? false);
    setError(undefined);
    setSuggestions(undefined);
    setBibFiles(undefined);
    let cancelled = false;
    // Entries without layout props (the editor's completion button) still
    // need the real values on the General tab; fetched like the file lists,
    // non-blocking. Applied only into untouched fields so a fast typist is
    // never clobbered by the response.
    if (initialNameRef.current === undefined) {
      void getProjectDetails(projectId).then((details) => {
        if (cancelled || !details) return;
        setName((value) => (value === "" ? details.name : value));
        setDescription((value) => (value === "" ? details.description : value));
      }).catch(() => undefined);
    }
    (async () => {
      try {
        // Files are mutable by other writers (the agent, other panels), so
        // the suggestion lists refetch on every open. Non-blocking: the
        // dialog is fully usable before they arrive, and the server
        // re-validates paths again on save.
        const files = await listAllFiles(projectId);
        if (cancelled) return;
        setSuggestions(
          files
            .filter((file) => !file.isDir && isMarkdownFilePath(file.name))
            .map((file) => file.path)
            .sort((a, b) => a.localeCompare(b)),
        );
        setBibFiles(
          files
            .filter((file) => !file.isDir && isBibFilePath(file.name))
            .map((file) => file.path)
            .sort((a, b) => a.localeCompare(b)),
        );
      } catch {
        if (!cancelled) setError("File suggestions could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, initialTab]);

  const select = (path: string) => {
    setDefaultFile(path);
    setSuggestionsOpen(false);
    setError(undefined);
  };

  const updateCompletion = (patch: Partial<CompletionSettings>) => {
    setCompletion((current) => ({ ...current, ...patch }));
    setError(undefined);
  };

  const setYearFilter = (year: CompletionYearFilter) => {
    setCompletion((current) => ({
      ...current,
      filters: {
        ...current.filters,
        year,
        // Seed a sensible starting year the first time Custom is picked.
        customMinYear: year === "custom" && current.filters.customMinYear === undefined
          ? new Date().getFullYear() - 5
          : current.filters.customMinYear,
      },
    }));
    setError(undefined);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      // An empty name means the details never loaded (e.g. the shared demo
      // project); skipping keeps the remaining saves working as before.
      const trimmedName = name.trim();
      if (trimmedName) {
        const detailsResult = await saveProjectDetails(projectId, trimmedName, description);
        if (!detailsResult.success) {
          setError(detailsResult.error);
          return;
        }
      }
      const trimmed = defaultFile.trim();
      if (trimmed) {
        const fileResult = await saveProjectDefaultOpenFile(projectId, trimmed);
        if (!fileResult.success) {
          setError(fileResult.error);
          return;
        }
      } else {
        // An empty field means no default: clear the saved one so loads fall
        // back to the automatic pick.
        const clearedResult = await clearProjectDefaultOpenFile(projectId);
        if (!clearedResult.success) {
          setError(clearedResult.error);
          return;
        }
      }
      const defaultsResult = await saveProjectDocumentDefaults(projectId, documentDefaults);
      if (!defaultsResult.success) {
        setError(defaultsResult.error);
        return;
      }
      const completionResult = await saveProjectCompletionSettings(projectId, completion);
      if (!completionResult.success) {
        setError(completionResult.error);
        return;
      }
      const systemSkillsResult = await saveProjectIncludeSystemSkills(projectId, includeSystemSkills);
      if (!systemSkillsResult.success) {
        setError(systemSkillsResult.error);
        return;
      }
      window.dispatchEvent(new CustomEvent(COMPLETION_SETTINGS_CHANGED_EVENT));
      router.refresh();
      toast.success("Settings saved");
      onOpenChange(false);
    } catch {
      setError("The settings could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No auto-focus: the user places the cursor themselves (Radix would
          otherwise focus and select the first input, the Project Name). */}
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="flex flex-col gap-4"
        >
          <div role="tablist" aria-label="Project settings sections" className="grid grid-cols-4 rounded-lg bg-muted p-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "general"}
              onClick={() => setActiveTab("general")}
              className={cn("rounded-md px-2 py-1.5 text-xs font-medium transition-colors", activeTab === "general" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              General
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "formatting"}
              onClick={() => setActiveTab("formatting")}
              className={cn("rounded-md px-2 py-1.5 text-xs font-medium transition-colors", activeTab === "formatting" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              Formatting
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "completion"}
              // onClick={() => notifyUpcomingFeature("AI Completion")}
              onClick={() => setActiveTab("completion")}
              className={cn("rounded-md px-2 py-1.5 text-xs font-medium transition-colors", activeTab === "completion" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              AI Completion
            </button>
          </div>

          {activeTab === "general" ? <section role="tabpanel" className="flex flex-col gap-4" aria-label="General">

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name" className="text-xs">
                Project Name
              </Label>
              <Input
                id="project-name"
                className="h-9 text-xs md:text-xs"
                value={name}
                maxLength={120}
                placeholder="e.g. Urban heat and public health"
                required
                disabled={saving}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(undefined);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-description" className="text-xs">
                Description <span className="font-normal text-muted-foreground">(Optional)</span>
              </Label>
              <Textarea
                id="project-description"
                className="resize-none text-xs"
                rows={3}
                maxLength={2000}
                value={description}
                placeholder="What question, topic, or outcome is guiding this work?"
                disabled={saving}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setError(undefined);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-default-file" className="text-xs">
                Default File
              </Label>
              <div className="relative">
                <Input
                  id="project-default-file"
                  className="h-9 text-xs md:text-xs"
                  value={defaultFile}
                  placeholder="research-draft.md"
                  disabled={saving}
                  autoComplete="off"
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() => setSuggestionsOpen(false)}
                  onChange={(event) => {
                    setDefaultFile(event.target.value);
                    setActiveIndex(0);
                    setError(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (!suggestionsOpen || matches.length === 0) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((highlighted + 1) % matches.length);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((highlighted - 1 + matches.length) % matches.length);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      select(matches[highlighted]);
                    } else if (event.key === "Escape") {
                      setSuggestionsOpen(false);
                    }
                  }}
                />
                {suggestionsOpen && (suggestions === undefined || matches.length > 0) ? (
                  <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
                    {suggestions === undefined ? (
                      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Loading files…
                      </div>
                    ) : matches.map((path, index) => (
                      <button
                        key={path}
                        type="button"
                        data-active={index === highlighted}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                          index === highlighted ? "bg-accent" : "hover:bg-accent/60",
                        )}
                        onMouseEnter={() => setActiveIndex(index)}
                        // Keep focus on the input so blur does not close the
                        // popup before the click lands.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => select(path)}
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{path}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {/* The empty input (placeholder only) reads as "nothing set", so
                spell out what a bare load opens today — the saved default
                until this edit is saved, the automatic pick after that. */}
              {!defaultFile.trim() && resolvedDefaultFile ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  Currently opening: {resolvedDefaultFile}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs">System Skills</Label>
                <p className="text-xs text-muted-foreground">
                  Show Beeblio's built-in agent skills in chat slash mentions.
                </p>
              </div>
              <Switch
                checked={includeSystemSkills}
                onCheckedChange={setIncludeSystemSkills}
                disabled={saving}
                aria-label="Include system skills"
              />
            </div>
          </section> : null}

          {activeTab === "formatting" ? <section role="tabpanel" className="flex flex-col gap-3" aria-label="Formatting">
            {/* <div>
              <Label className="text-xs">Document Style</Label>
            </div> */}
            <div className="rounded-lg border bg-muted/35 p-3">
              <div className="mb-2 text-[0.5rem] font-medium tracking-wide text-muted-foreground uppercase">
                Preview
              </div>
              <div
                className="leading-relaxed"
                style={{
                  fontFamily: documentFontFamilyCss(documentDefaults.fontFamily),
                  fontSize: documentDefaults.fontSize || "15px",
                  lineHeight: 1.7,
                }}
                aria-label="Document style preview"
              >
                Research builds on prior evidence{" "}
                <span className="beeblio-citation">
                  {formatCitation(PREVIEW_REFERENCE, documentDefaults.citationStyle, 1)}
                </span>{" "}
                and makes each source easy to trace.
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <SettingsSelect
                label="Citation System"
                value={documentDefaults.citationStyle}
                options={CITATION_STYLES}
                disabled={saving}
                onChange={(citationStyle) => setDocumentDefaults((current) => ({ ...current, citationStyle }))}
              />
              <SettingsSelect
                label="Font"
                value={documentDefaults.fontFamily || "default"}
                options={DOCUMENT_FONT_FAMILIES.map(([value, label]) => [value || "default", label] as const)}
                disabled={saving}
                onChange={(fontFamily) => setDocumentDefaults((current) => ({ ...current, fontFamily: fontFamily === "default" ? "" : fontFamily }))}
              />
              <SettingsSelect
                label="Font Size"
                value={documentDefaults.fontSize || "default"}
                options={DOCUMENT_FONT_SIZES.map(([value, label]) => [value || "default", label] as const)}
                disabled={saving}
                onChange={(fontSize) => setDocumentDefaults((current) => ({ ...current, fontSize: fontSize === "default" ? "" : fontSize }))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Style applied to new documents unless the document has its own setting.</p>
            </div>
          </section> : null}

          {activeTab === "completion" ? <section role="tabpanel" className="flex flex-col gap-3" aria-label="AI completion">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs">Auto Completion</Label>
                <p className="text-xs text-muted-foreground">
                  Suggest the next sentence, with citations, as you write.
                </p>
              </div>
              <Switch
                checked={completion.enabled}
                onCheckedChange={(enabled) => updateCompletion({ enabled })}
                disabled={saving}
                aria-label="Auto completion"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs">Sources</Label>
              <div className="divide-y rounded-lg border">
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Online Database</p>
                    <p className="text-xs text-muted-foreground">
                      Let Beeblio search various literature databases.
                    </p>
                  </div>
                  <Switch
                    size="sm"
                    checked={completion.sources.literatureDb}
                    onCheckedChange={(literatureDb) =>
                      updateCompletion({ sources: { ...completion.sources, literatureDb } })}
                    disabled={saving}
                    aria-label="Literature DB source"
                  />
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">Library</p>
                      <p className="text-xs text-muted-foreground">
                        Cite from your own BibTeX library.
                      </p>
                    </div>
                    <Switch
                      size="sm"
                      checked={completion.sources.library}
                      onCheckedChange={(library) =>
                        updateCompletion({ sources: { ...completion.sources, library } })}
                      disabled={saving}
                      aria-label="Library source"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <Label htmlFor="project-completion-library" className="shrink-0 text-[11px] text-muted-foreground">
                      Library File
                    </Label>
                    <Select
                      value={completion.sources.libraryPath}
                      onValueChange={(libraryPath) =>
                        updateCompletion({ sources: { ...completion.sources, libraryPath } })}
                      disabled={saving || !completion.sources.library}
                    >
                      {/* Content-sized (base w-fit) so full .bib paths show;
                          max-w-full keeps a very long path inside the row. */}
                      <SelectTrigger id="project-completion-library" className="h-8 max-w-full text-xs">
                        <SelectValue placeholder="Choose a .bib file" />
                      </SelectTrigger>
                      <SelectContent>
                        {libraryOptions.map((path) => (
                          <SelectItem key={path} value={path} className="text-xs">
                            {path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs">Filters</Label>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <Label className="shrink-0 text-[11px] text-muted-foreground">Publication Year</Label>
                <div role="group" aria-label="Publication year" className="flex items-center rounded-lg bg-muted/70 p-0.5">
                  <FilterOption
                    active={completion.filters.year === "all"}
                    disabled={saving}
                    onClick={() => setYearFilter("all")}
                  >
                    All Years
                  </FilterOption>
                  <FilterOption
                    active={completion.filters.year === "last5"}
                    disabled={saving}
                    onClick={() => setYearFilter("last5")}
                  >
                    Last 5 Years
                  </FilterOption>
                  <FilterOption
                    active={completion.filters.year === "custom"}
                    disabled={saving}
                    onClick={() => setYearFilter("custom")}
                  >
                    Custom
                  </FilterOption>
                </div>
              </div>
              {completion.filters.year === "custom" ? (
                <div className="flex animate-in fade-in items-center justify-end gap-1.5">
                  <Input
                    type="number"
                    min={1500}
                    max={2200}
                    className="h-8 w-20 text-xs md:text-xs"
                    value={completion.filters.customMinYear ?? ""}
                    placeholder="From"
                    disabled={saving}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      setCompletion((current) => ({
                        ...current,
                        filters: {
                          ...current.filters,
                          customMinYear: Number.isFinite(parsed) ? parsed : undefined,
                        },
                      }));
                      setError(undefined);
                    }}
                    aria-label="Starting publication year"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="number"
                    min={1500}
                    max={2200}
                    className="h-8 w-20 text-xs md:text-xs"
                    value={completion.filters.customMaxYear ?? ""}
                    placeholder="To"
                    disabled={saving}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      setCompletion((current) => ({
                        ...current,
                        filters: {
                          ...current.filters,
                          customMaxYear: Number.isFinite(parsed) ? parsed : undefined,
                        },
                      }));
                      setError(undefined);
                    }}
                    aria-label="Ending publication year"
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <Label className="shrink-0 text-[11px] text-muted-foreground">Citations Count</Label>
                <div role="group" aria-label="Citations count" className="flex items-center rounded-lg bg-muted/70 p-0.5">
                  {COMPLETION_CITATIONS_FILTERS.map((value) => (
                    <FilterOption
                      key={value}
                      active={completion.filters.citations === value}
                      disabled={saving}
                      onClick={() =>
                        updateCompletion({ filters: { ...completion.filters, citations: value } })}
                    >
                      {value === "all" ? "All" : `${value}+`}
                    </FilterOption>
                  ))}
                </div>
              </div>
              {/* <p className="text-[11px] text-muted-foreground">
                Filters apply to both the library and literature search results.
              </p> */}
            </div>
          </section> : null}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const id = `project-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
        <SelectTrigger id={id} className="!h-8 w-52 max-w-[60%] bg-card px-2.5 py-1.5 text-xs shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([option, optionLabel]) => (
            <SelectItem key={option} value={option} className="text-xs">{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * One selectable chip inside a filter's segmented row — same active style as
 * the theme group in the user menu.
 */
function FilterOption({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="flex items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-sm disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}
