const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  bib: "text/x-bibtex",
  c: "text/x-csrc",
  cpp: "text/x-c++src",
  css: "text/css",
  csv: "text/csv",
  dart: "application/dart",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  go: "text/x-go",
  h: "text/x-chdr",
  html: "text/html",
  htm: "text/html",
  hwp: "application/x-hwp",
  ipynb: "application/vnd.jupyter",
  java: "text/x-java-source",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  jsx: "text/jsx",
  kt: "text/x-kotlin",
  latex: "application/x-latex",
  md: "text/markdown",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  php: "application/x-php",
  png: "image/png",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ps1: "application/x-powershell",
  py: "text/x-python",
  r: "text/x-rsrc",
  rst: "text/x-rst",
  rtf: "text/rtf",
  rs: "text/x-rust",
  sh: "application/x-shellscript",
  sql: "application/sql",
  tex: "application/x-tex",
  ts: "application/typescript",
  tsv: "text/tab-separated-values",
  tsx: "text/tsx",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  zip: "application/zip",
  zsh: "application/x-zsh",
};

export const KNOWLEDGE_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const KNOWLEDGE_ACCEPT = Object.keys(MIME_BY_EXTENSION).map((extension) => `.${extension}`).join(",");

export function knowledgeMimeType(fileName: string): string | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? MIME_BY_EXTENSION[extension] : undefined;
}

export function acceptsKnowledgeFile(fileName: string): boolean {
  return knowledgeMimeType(fileName) !== undefined;
}
