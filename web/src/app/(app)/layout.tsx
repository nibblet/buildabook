import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject, isOnboarded } from "@/lib/projects";
import { loadSpine } from "@/lib/spine";
import { AppShell } from "@/components/app-shell";
import { env } from "@/lib/env";
import { envIsConfigured } from "@/lib/env";

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
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const onboarded = await isOnboarded(project.id);
  // Route guard is handled in the page, but we can also short-circuit:
  // done in-page so /onboarding can still render.

  const spine = onboarded ? await loadSpine(project.id) : null;
  const admins = env.adminEmails();
  const isAdmin = admins.includes((user.email || "").toLowerCase());

  return (
    <AppShell
      spine={spine}
      projectTitle={project.title}
      userEmail={user.email || ""}
      isAdmin={isAdmin}
    >
      {children}
    </AppShell>
  );
}
