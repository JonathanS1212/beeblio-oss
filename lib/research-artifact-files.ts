import {
  ANALYSIS_DIRECTORY,
  DATA_DIRECTORY,
  REPORTS_DIRECTORY,
} from "./research-workspace.ts";
import { AUDIO_FILE_EXTENSIONS, VIDEO_FILE_EXTENSIONS } from "./media-files";

export type UploadableArtifactView = "data" | "analysis" | "reports" | "figures";

// Audio/video (interview recordings, field footage) is research data too.
const DATA_EXTENSIONS = new Set<string>([
  "arrow", "csv", "dta", "feather", "json", "jsonl", "ndjson", "parquet",
  "sav", "sas7bdat", "tsv", "xls", "xlsx",
  ...AUDIO_FILE_EXTENSIONS,
  ...VIDEO_FILE_EXTENSIONS,
]);
const ANALYSIS_EXTENSIONS = new Set([
  "bash", "do", "html", "htm", "ipynb", "jl", "js", "jsx", "lua", "m",
  "mat", "mjs", "py", "qmd", "r", "rmd", "sas", "sh", "sql", "stan",
  "ts", "tsx", "yaml", "yml",
]);
const REPORT_EXTENSIONS = new Set([
  "doc", "docx", "html", "htm", "latex", "md", "markdown", "odt", "pdf",
  "ppt", "pptx", "qmd", "rtf", "tex", "txt",
]);
export const FIGURE_IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp",
]);
export const FIGURE_DIAGRAM_EXTENSIONS = new Set(["excalidraw", "mermaid", "mmd"]);

export const ARTIFACT_UPLOAD_CONFIG: Record<UploadableArtifactView, {
  directory: string;
  accept: string;
  formats: string;
}> = {
  data: {
    directory: DATA_DIRECTORY,
    accept: [...DATA_EXTENSIONS].map((extension) => `.${extension}`).join(","),
    formats: "CSV, TSV, JSON, Excel, Parquet, statistical data files, and audio or video recordings",
  },
  analysis: {
    directory: ANALYSIS_DIRECTORY,
    accept: [...ANALYSIS_EXTENSIONS].map((extension) => `.${extension}`).join(","),
    formats: "scripts, notebooks, SQL, HTML, and analysis documents",
  },
  reports: {
    directory: REPORTS_DIRECTORY,
    accept: [...REPORT_EXTENSIONS].map((extension) => `.${extension}`).join(","),
    formats: "Markdown, PDF, Word, presentation, LaTeX, and text documents",
  },
  figures: {
    directory: REPORTS_DIRECTORY,
    accept: [...FIGURE_IMAGE_EXTENSIONS, ...FIGURE_DIAGRAM_EXTENSIONS, "html", "htm"]
      .map((extension) => `.${extension}`).join(","),
    formats: "JPG, PNG, SVG, other images, Excalidraw, Mermaid, and HTML",
  },
};

export function artifactFileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLocaleLowerCase() : "";
}

export function isFigureFileName(name: string) {
  const extension = artifactFileExtension(name);
  return FIGURE_IMAGE_EXTENSIONS.has(extension) ||
    FIGURE_DIAGRAM_EXTENSIONS.has(extension) ||
    extension === "html" ||
    extension === "htm";
}

export function acceptsArtifactFile(view: UploadableArtifactView, name: string) {
  const extension = artifactFileExtension(name);
  if (view === "figures") return isFigureFileName(name);
  if (view === "data") return DATA_EXTENSIONS.has(extension);
  if (view === "analysis") return ANALYSIS_EXTENSIONS.has(extension);
  return REPORT_EXTENSIONS.has(extension);
}
