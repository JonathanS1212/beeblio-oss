import dynamic from "next/dynamic";

import { EditorSkeleton } from "./editor-skeleton";
import type { WorkspaceEditorDefinition } from "./types";
import { extensionOf } from "./types";
import {
  AUDIO_FILE_EXTENSIONS,
  VIDEO_FILE_EXTENSIONS,
} from "@/lib/media-files";

// Editors load on demand: the registry is the workspace's largest client-bundle
// contributor (Tiptap, CodeMirror, media-chrome, …), and only one editor is
// ever mounted at a time. Each entry renders its skeleton while the chunk
// streams in. `ssr: false` keeps browser-API-heavy editors off the server; the
// workspace opens files from a client effect (and share views hydrate into the
// skeleton), so nothing meaningful is lost from the server-rendered HTML.
const CsvEditor = dynamic(() => import("./csv-editor").then((m) => m.CsvEditor), { ssr: false, loading: () => <EditorSkeleton kind="table" /> });
const ExcalidrawEditor = dynamic(() => import("./excalidraw-editor").then((m) => m.ExcalidrawEditor), { ssr: false, loading: () => <EditorSkeleton kind="canvas" /> });
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), { ssr: false, loading: () => <EditorSkeleton kind="page" /> });
const OfficeWebViewer = dynamic(() => import("./office-web-viewer").then((m) => m.OfficeWebViewer), { ssr: false, loading: () => <EditorSkeleton kind="page" /> });
const NotebookEditor = dynamic(() => import("./notebook-editor").then((m) => m.NotebookEditor), { ssr: false, loading: () => <EditorSkeleton kind="notebook" /> });
const LatexEditor = dynamic(() => import("./latex-editor").then((m) => m.LatexEditor), { ssr: false, loading: () => <EditorSkeleton kind="prose" /> });
const BibliographyEditor = dynamic(() => import("./bibliography-editor").then((m) => m.BibliographyEditor), { ssr: false, loading: () => <EditorSkeleton kind="table" /> });
const MatrixEditor = dynamic(() => import("./matrix-editor").then((m) => m.MatrixEditor), { ssr: false, loading: () => <EditorSkeleton kind="table" /> });
const HtmlEditor = dynamic(() => import("./html-editor").then((m) => m.HtmlEditor), { ssr: false, loading: () => <EditorSkeleton kind="prose" /> });
const JsonEditor = dynamic(() => import("./json-editor").then((m) => m.JsonEditor), { ssr: false, loading: () => <EditorSkeleton kind="code" /> });
const MarkdownEditor = dynamic(() => import("./legacy-editors").then((m) => m.MarkdownEditor), { ssr: false, loading: () => <EditorSkeleton kind="prose" /> });
const ImageViewer = dynamic(() => import("./legacy-editors").then((m) => m.ImageViewer), { ssr: false, loading: () => <EditorSkeleton kind="image" /> });
const MediaPlayer = dynamic(() => import("./media-player").then((m) => m.MediaPlayer), { ssr: false, loading: () => <EditorSkeleton kind="media" /> });
const TextEditor = dynamic(() => import("./legacy-editors").then((m) => m.TextEditor), { ssr: false, loading: () => <EditorSkeleton kind="code" /> });
const FormBuilderEditor = dynamic(() => import("./form-builder-editor").then((m) => m.FormBuilderEditor), { ssr: false, loading: () => <EditorSkeleton kind="form" /> });
const UnsupportedViewer = dynamic(() => import("./legacy-editors").then((m) => m.UnsupportedViewer), { ssr: false, loading: () => <EditorSkeleton kind="generic" /> });

const registry: WorkspaceEditorDefinition[] = [
  { id: "csv", extensions: ["csv"], skeleton: "table", Component: CsvEditor },
  { id: "excalidraw", extensions: ["excalidraw"], skeleton: "canvas", Component: ExcalidrawEditor },
  { id: "pdf", extensions: ["pdf"], skeleton: "page", Component: PdfViewer },
  { id: "office", extensions: ["doc", "docx", "odt", "xls", "xlsx", "ppt", "pptx", "odp"], skeleton: "page", Component: OfficeWebViewer },
  { id: "notebook", extensions: ["ipynb"], skeleton: "notebook", Component: NotebookEditor },
  { id: "latex", extensions: ["tex"], skeleton: "prose", Component: LatexEditor },
  { id: "bibliography", extensions: ["bib", "ris"], skeleton: "table", Component: BibliographyEditor },
  { id: "matrix", extensions: ["matrix"], skeleton: "table", Component: MatrixEditor },
  { id: "html", extensions: ["html", "htm"], skeleton: "prose", Component: HtmlEditor },
  { id: "json", extensions: ["json"], skeleton: "code", Component: JsonEditor },
  { id: "markdown", extensions: ["md", "markdown", "mmd", "mermaid"], skeleton: "prose", Component: MarkdownEditor },
  { id: "image", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"], skeleton: "image", Component: ImageViewer },
  { id: "audio", extensions: [...AUDIO_FILE_EXTENSIONS], skeleton: "media", Component: MediaPlayer },
  { id: "video", extensions: [...VIDEO_FILE_EXTENSIONS], skeleton: "media", Component: MediaPlayer },
  { id: "text", extensions: ["txt", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "yaml", "yml", "xml", "css", "sh", "bash", "sql", "log", "ini", "toml", "env", "rtf", "jsonl", "ndjson"], skeleton: "code", Component: TextEditor },
];

const IN_PLACE_REFRESH_EDITOR_IDS = new Set([
  "csv",
  "excalidraw",
  "notebook",
  "latex",
  "bibliography",
  "matrix",
  "html",
  "json",
  "markdown",
  "text",
]);

// *.form.html files carry a two-segment extension, so they are matched on the
// full name before the single-segment extension lookup below.
export function isFormBuilderFile(name: string): boolean {
  return name.toLowerCase().endsWith(".form.html");
}

// Same story for *.excalidraw.json, which would otherwise land on the generic
// json editor.
export function isExcalidrawFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".excalidraw") || lower.endsWith(".excalidraw.json");
}

function definitionFor(name: string): WorkspaceEditorDefinition | undefined {
  const extension = extensionOf(name);
  return registry.find((editor) => editor.extensions.includes(extension));
}

export function editorFor(name: string) {
  if (isFormBuilderFile(name)) return FormBuilderEditor;
  if (isExcalidrawFile(name)) return ExcalidrawEditor;
  return definitionFor(name)?.Component ?? UnsupportedViewer;
}

export function skeletonKindFor(name: string) {
  if (isFormBuilderFile(name)) return "form" as const;
  return definitionFor(name)?.skeleton ?? "generic";
}

export function editorRefreshesInPlace(name: string) {
  if (isFormBuilderFile(name)) return true;
  if (isExcalidrawFile(name)) return true;
  const editor = definitionFor(name);
  return editor ? IN_PLACE_REFRESH_EDITOR_IDS.has(editor.id) : false;
}

// Editors backed by useTextFile read their content through the text cache, so
// these are the files whose bytes are worth warming before a click.
export function editorLoadsTextContent(name: string) {
  if (isFormBuilderFile(name)) return true;
  const editor = definitionFor(name);
  return editor ? IN_PLACE_REFRESH_EDITOR_IDS.has(editor.id) : false;
}
