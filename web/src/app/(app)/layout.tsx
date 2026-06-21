import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getActiveProject, isOnboarded } from "@/lib/projects";
import { loadSpine } from "@/lib/spine";
import { AppShell } from "@/components/app-shell";
import { env } from "@/lib/env";
import { envIsConfigured } from "@/lib/env";
import { OutboxDrainer } from "@/components/offline/outbox-drainer";
import { OfflineStatus } from "@/components/offline/offline-status";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!envIsConfigured()) {
    // Show a setup screen if env isn't configured yet.
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-4 text-2xl font-semibold">Setup needed</h1>
        <p className="text-muted-foreground">
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in
          the Supabase and Anthropic values, then restart the dev server.
        </p>
      </div>
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const project = await getActiveProject();
  if (!project) redirect("/login");

  const onboarded = await isOnboarded(project.id);
  const spine = onboarded ? await loadSpine(project.id) : null;
  const admins = env.adminEmails();
  const isAdmin = admins.includes((user.email || "").toLowerCase());

  return (
    <>
      <AppShell
        spine={spine}
        projectTitle={project.title}
        userEmail={user.email || ""}
        isAdmin={isAdmin}
      >
        {children}
      </AppShell>
      <OutboxDrainer />
      <div className="pointer-events-none fixed bottom-3 right-3 z-50">
        <OfflineStatus className="pointer-events-auto shadow-sm" />
      </div>
    </>
  );
}
