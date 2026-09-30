import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { UserMenu } from "@/app/_components/user-menu";
import { ForceLightTheme } from "@/app/_components/force-light-theme";
import { requireUser } from "@/lib/auth/session";
import {
  parseProjectSettings,
  resolveDefaultOpenFile,
} from "@/lib/project-settings";
import { listAgentSkills } from "@/lib/skills-storage";
import { getOwnedProject, getProjectSessions } from "./actions";
import { ProjectLayoutUI } from "./_components/project-layout-ui";
import { UpcomingFeatureDialog } from "./_components/upcoming-feature";
import { rememberedRailActivity } from "./_components/rail-activity";
import { getFileContent, getRootTree } from "./file-actions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Largest default-file payload worth embedding in the layout's RSC stream:
// beyond this the fetch-on-open path is cheaper than a bigger document.
const DEFAULT_FILE_SEED_MAX_BYTES = 512 * 1024;

/**
 * Reads the default open file's text so its first render needs no round trip.
 * The size cap keeps binary blobs and oversized documents out of the RSC
 * payload, and the NUL sniff rejects decoded binaries that slip under it —
 * only text editors read the client cache this seeds, and only editors whose
 * content is text resolve as a default file anyway.
 */
async function readDefaultFileSeed(
  projectId: string,
  filePath: string | undefined,
  rootTree: Awaited<ReturnType<typeof getRootTree>>,
): Promise<string | undefined> {
  if (!filePath) return undefined;
  const entry = [
    ...rootTree.entries,
    ...Object.values(rootTree.children).flat(),
  ].find((candidate) => candidate.path === filePath && !candidate.isDir);
  if (!entry || entry.size <= 0 || entry.size > DEFAULT_FILE_SEED_MAX_BYTES) return undefined;
  try {
    const content = await getFileContent(projectId, filePath);
    if (content === null || content.slice(0, 1024).includes("\u0000")) return undefined;
    return content;
  } catch {
    return undefined;
  }
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const [initialRootTree, initialSessions, project, initialSkills] =
    await Promise.all([
      getRootTree(projectId),
      getProjectSessions(projectId),
      getOwnedProject(user, projectId),
      // Skills seed for the Skills panel; on failure it falls back to the
      // panel's own fetch instead of failing the whole layout.
      listAgentSkills(user.id).catch(() => undefined),
    ]);
  if (!project) {
    redirect("/workspace");
  }
  
  const initialActivity = rememberedRailActivity(
    (await cookies()).get(`beeblio:${projectId}:rail-activity`)?.value,
  );

  // Only projects the user owns have a settings row to write to; the shared
  // demo project resolves its default (the demo main document) without one.
  // The parsed settings ride along to the user menu so the settings dialog
  // opens without a server round trip; every save revalidates this layout,
  // which keeps the props fresh.
  const settings = parseProjectSettings(project?.settings);
  const defaultFilePath = resolveDefaultOpenFile({
    projectId,
    settings,
    rootTree: initialRootTree,
  });
  const defaultFileContent = await readDefaultFileSeed(
    projectId,
    defaultFilePath,
    initialRootTree,
  );

  return (
    <>
      <ForceLightTheme />
      <UpcomingFeatureDialog />
      <ProjectLayoutUI
      projectId={projectId}
      projectName={project?.name || projectId}
      initialActivity={initialActivity}
      initialFiles={initialRootTree.entries}
      initialRootTreeChildren={initialRootTree.children}
      initialSkills={initialSkills}
      initialSessions={initialSessions}
      defaultFilePath={defaultFilePath}
      defaultFileContent={defaultFileContent}
      userMenu={
        <UserMenu
          key="project-user-menu"
          user={{ name: user.name, email: user.email, image: user.image }}
          projectId={project ? projectId : undefined}
          showThemeSwitcher={false}
          initialSettings={settings}
          projectName={project?.name}
          projectDescription={project?.description ?? ""}
          resolvedDefaultFile={defaultFilePath}
        />
      }
    >
      {children}
    </ProjectLayoutUI>
    </>
  );
}
