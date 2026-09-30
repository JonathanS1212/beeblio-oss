"use client";

import { useState } from "react";
import { toast } from "sonner";

export function useWorkspaceDownload(sourceUrl: string | undefined, filePath: string) {
  const [downloading, setDownloading] = useState(false);
  const filename = filePath.split("/").at(-1) || filePath;

  const download = async () => {
    setDownloading(true);
    try {
      const projectId = window.location.pathname.split("/").filter(Boolean)[0];
      const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
      const link = document.createElement("a");
      const resolvedUrl = sourceUrl ?? `/api/workspace/${encodeURIComponent(projectId)}/${encodedPath}`;
      link.href = `${resolvedUrl}${resolvedUrl.includes("?") ? "&" : "?"}download=file`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error("Failed to download", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDownloading(false);
    }
  };

  return { download, downloading };
}
