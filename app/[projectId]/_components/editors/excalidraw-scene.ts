import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

/**
 * A parsed .excalidraw scene: the shape `initialData` and the export helpers
 * consume. Older saves may carry `files` as an array; it is normalized here so
 * the rest of the app only ever sees the record form.
 */
export interface ExcalidrawScene {
  elements: ExcalidrawElement[];
  appState: Readonly<Partial<AppState>>;
  files: BinaryFiles;
}

/**
 * Parses .excalidraw JSON (or .excalidraw.json). An empty input is treated as
 * an empty scene so freshly created files open on a blank canvas; anything
 * that is neither empty nor a scene-bearing object reports an error.
 */
export function parseExcalidrawScene(input: string):
  | { scene: ExcalidrawScene }
  | { error: string } {
  if (!input.trim()) return { scene: emptyExcalidrawScene() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { error: "This file is not valid JSON, so it can't be opened as a drawing." };
  }

  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { elements?: unknown }).elements)) {
    return { error: "This file doesn't look like an Excalidraw scene (no elements array)." };
  }

  const raw = parsed as {
    elements: ExcalidrawElement[];
    appState?: Readonly<Partial<AppState>>;
    files?: unknown;
  };
  return {
    scene: {
      elements: raw.elements,
      appState: raw.appState ?? {},
      files: normalizeSceneFiles(raw.files),
    },
  };
}

export function emptyExcalidrawScene(): ExcalidrawScene {
  return { elements: [], appState: {}, files: {} };
}

function normalizeSceneFiles(files: unknown): BinaryFiles {
  if (Array.isArray(files)) {
    return Object.fromEntries(
      files
        .filter((file): file is BinaryFileData =>
          typeof file === "object" && file !== null && typeof (file as { id?: unknown }).id === "string")
        .map((file) => [file.id, file]),
    );
  }
  if (typeof files === "object" && files !== null) return files as BinaryFiles;
  return {};
}
