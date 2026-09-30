"use client";

import { memo, useCallback, type ComponentProps } from "react";

import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

type ExcalidrawChangeHandler = NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>;

export interface ExcalidrawCanvasProps {
  initialData: ExcalidrawInitialDataState;
  theme: "light" | "dark";
  /**
   * Emits the canonical .excalidraw JSON for the current scene (via
   * serializeAsJSON) together with the live non-deleted element count, so the
   * editor can feed the text draft and the status line without re-parsing.
   */
  onSceneChange: (sceneJson: string, elementCount: number) => void;
}

/**
 * The only module that imports the Excalidraw package at runtime; the editor
 * lazy-loads it with ssr: false so the bundle stays out of the main chunk.
 */
function ExcalidrawCanvasImpl({ initialData, theme, onSceneChange }: ExcalidrawCanvasProps) {
  const handleChange = useCallback<ExcalidrawChangeHandler>(
    (elements, appState, files) => {
      onSceneChange(
        serializeAsJSON(elements, appState, files, "local"),
        elements.filter((element) => !element.isDeleted).length,
      );
    },
    [onSceneChange],
  );

  return <Excalidraw initialData={initialData} theme={theme} onChange={handleChange} />;
}

const ExcalidrawCanvas = memo(ExcalidrawCanvasImpl);
export default ExcalidrawCanvas;
