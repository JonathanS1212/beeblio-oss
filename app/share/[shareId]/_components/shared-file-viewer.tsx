"use client";

import { FileViewer } from "@/app/[projectId]/_components/file-viewer";
import { PublicViewContext } from "./public-view-context";

export function SharedFileViewer({
  shareId,
  projectSlug,
  filePath,
  isOwner
}: {
  shareId: string;
  projectSlug: string;
  filePath: string;
  isOwner: boolean;
}) {
  const fileName = filePath.split('/').pop() || filePath;
  const fileEntry = {
    name: fileName,
    path: filePath,
    isDir: false,
    size: 0
  };

  return (
    <PublicViewContext.Provider value={{ shareId, isOwner, projectSlug, filePath }}>
      <FileViewer
        projectId={projectSlug}
        file={fileEntry}
      />
    </PublicViewContext.Provider>
  );
}
