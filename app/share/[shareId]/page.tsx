import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publicFiles, projects } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import { isFormHtml } from "@/lib/forms/parse";
import { readAgentWorkspaceFile } from "@/lib/workspace-files";
import { PublicFormView } from "./_components/public-form-view";
import { ShareThemeToggle } from "./_components/share-theme-toggle";
import { SharedFileViewer } from "./_components/shared-file-viewer";

export default async function SharedFilePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const [user, fileRecord] = await Promise.all([
    getUser(),
    db.query.publicFiles.findFirst({ where: eq(publicFiles.id, shareId) }),
  ]);

  if (!fileRecord) notFound();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, fileRecord.projectId)
  });

  if (!project) notFound();

  const isOwner = user?.id === project.userId;

  // Survey forms get a distraction-free full-page respondent view instead of
  // the shared-file viewer chrome. The form runtime only records submissions
  // when the document is served from /api/share/<id>/…, so the iframe points
  // at the raw asset URL.
  if (fileRecord.filePath.toLowerCase().endsWith(".html")) {
    let html: string | null = null;
    try {
      const response = await readAgentWorkspaceFile(
        project.userId,
        project.slug,
        fileRecord.filePath,
      );
      html = await response.text();
    } catch {
      html = null;
    }
    if (html !== null && isFormHtml(html)) {
      const encodedPath = fileRecord.filePath
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      return (
        <div className="h-screen w-full">
          <PublicFormView assetUrl={`/api/share/${encodeURIComponent(shareId)}/${encodedPath}`} />
          <ShareThemeToggle />
        </div>
      );
    }
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <SharedFileViewer
        shareId={shareId}
        projectSlug={project.slug}
        filePath={fileRecord.filePath}
        isOwner={isOwner}
      />
      <ShareThemeToggle />
    </div>
  );
}
