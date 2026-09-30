"use client";

import { useEffect, useState } from "react";

import { renderOfficeDocument } from "../../file-actions";
import { EditorError, EditorLoading } from "./editor-states";

export function OfficePdfPreview({
  projectId,
  filePath,
  version = 0,
}: {
  projectId: string;
  filePath: string;
  version?: number;
}) {
  const [preview, setPreview] = useState<{ kind: "pdf" | "html"; content: string }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    setError(undefined);
    void renderOfficeDocument(projectId, filePath).then((result) => {
      if (cancelled) return;
      if (result.success) setPreview({ kind: result.kind, content: result.content });
      else setError(result.error);
    });
    return () => { cancelled = true; };
  }, [filePath, projectId, version]);

  if (error) return <EditorError message={error} />;
  if (!preview) return <EditorLoading />;
  if (preview.kind === "html") {
    return <iframe title="Document preview" sandbox="" srcDoc={preview.content} className="h-full w-full bg-white" />;
  }
  return <object data={`data:application/pdf;base64,${preview.content}#toolbar=0&navpanes=0&view=FitH`} type="application/pdf" className="h-full w-full bg-neutral-200 dark:bg-neutral-900" />;
}
