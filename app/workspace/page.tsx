import { getWorkspaceDashboardData } from "../actions";
import { UserMenu } from "../_components/user-menu";
import { ProjectsDashboardClient } from "../_components/projects-dashboard-client";
import { Brand } from "../_components/brand";
import { requireUser } from "@/lib/auth/session";
import { ensureDemoProject } from "@/lib/demo-project";

export default async function ProjectsDashboard() {
  const user = await requireUser();
  await ensureDemoProject(user.id).catch((error) => {
    // A template or workspace outage should not block access to the user's
    // existing projects. The idempotent provisioner retries on the next visit.
    console.error("[workspace] demo project provisioning failed", error);
  });
  const { projects, recentSessions } = await getWorkspaceDashboardData();

  return (
    <div className="min-h-screen bg-background [background-image:radial-gradient(circle_at_12%_0%,oklch(0.91_0.035_235/0.45),transparent_27rem)] dark:[background-image:radial-gradient(circle_at_12%_0%,oklch(0.30_0.06_235/0.4),transparent_27rem)]">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[86rem] items-center justify-between px-5 sm:px-8">
          <Brand href="/workspace" />
          <div className="flex items-center gap-3">
            <UserMenu
              user={{ name: user.name, email: user.email, image: user.image }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[86rem] px-5 py-10 sm:px-8 sm:py-14">
        <ProjectsDashboardClient
          initialProjects={projects}
          recentSessions={recentSessions}
        />
      </main>
    </div>
  );
}
