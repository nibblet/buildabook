import {
  newProjectDefaults,
  writingProfileFromEnv,
} from "@/lib/deployment/writing-profile";
import { updateLastWorkspaceId } from "@/lib/profiles";
import { seedBeatsForWritingProfile } from "@/lib/seed/beats";
import { supabaseServer } from "@/lib/supabase/server";
import type { Project } from "@/lib/supabase/types";

export type ProjectSummary = {
  id: string;
  title: string;
  updated_at: string;
  target_wordcount: number;
};

async function requireAuthUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

async function fetchProjectForUser(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  projectId: string,
): Promise<Project | null> {
  const profile = writingProfileFromEnv();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("writing_profile", profile)
    .maybeSingle();
  if (error) throw error;
  return (data as Project | null) ?? null;
}

async function seedBeats(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  projectId: string,
  profile: ReturnType<typeof writingProfileFromEnv>,
): Promise<void> {
  const seedBeats = seedBeatsForWritingProfile(profile);
  if (!seedBeats.length) return;
  const beatRows = seedBeats.map((b) => ({
    project_id: projectId,
    order_index: b.order_index,
    act: b.act,
    beat_type: b.beat_type,
    title: b.title,
    description: b.description,
    why_it_matters: b.why_it_matters,
    target_chapter: b.target_chapter,
  }));
  const { error: beatsErr } = await supabase.from("beats").insert(beatRows);
  if (beatsErr) throw beatsErr;
}

async function insertProjectRow(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  title?: string,
): Promise<Project> {
  const profile = writingProfileFromEnv();
  const defs = newProjectDefaults(profile);

  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      title: title?.trim() || defs.title,
      subgenre: defs.subgenre,
      heat_level: defs.heat_level,
      target_wordcount: defs.target_wordcount,
      writing_profile: profile,
    })
    .select("*")
    .single();
  if (error) throw error;

  await seedBeats(supabase, (created as Project).id, profile);
  return created as Project;
}

async function insertBlankChapterPlaceholder(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  projectId: string,
): Promise<void> {
  const { data: chapter, error: chapterErr } = await supabase
    .from("chapters")
    .insert({
      project_id: projectId,
      order_index: 1,
      title: "",
    })
    .select("id")
    .single();
  if (chapterErr) throw chapterErr;

  const { error: sceneErr } = await supabase.from("scenes").insert({
    chapter_id: chapter.id,
    order_index: 1,
    status: "planned",
  });
  if (sceneErr) throw sceneErr;
}

export async function listProjectsForUser(): Promise<ProjectSummary[]> {
  const { supabase, user } = await requireAuthUser();
  if (!user) return [];

  const profile = writingProfileFromEnv();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, updated_at, target_wordcount")
    .eq("user_id", user.id)
    .eq("writing_profile", profile)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectSummary[];
}

export async function setActiveProject(projectId: string): Promise<void> {
  const { supabase, user } = await requireAuthUser();
  if (!user) throw new Error("Not authenticated.");

  const project = await fetchProjectForUser(supabase, user.id, projectId);
  if (!project) throw new Error("Project not found.");

  await updateLastWorkspaceId(user.id, projectId);
}

export async function createProject(opts: {
  title?: string;
  mode: "blank" | "import";
}): Promise<Project> {
  const { supabase, user } = await requireAuthUser();
  if (!user) throw new Error("Not authenticated.");

  const project = await insertProjectRow(supabase, user.id, opts.title);

  if (opts.mode === "blank") {
    await insertBlankChapterPlaceholder(supabase, project.id);
  }

  await updateLastWorkspaceId(user.id, project.id);
  return project;
}

// Returns the user's active project. Auto-creates one on first visit so the
// novice user never sees a "create a project" page.
export async function getActiveProject(): Promise<Project | null> {
  const { supabase, user } = await requireAuthUser();
  if (!user) return null;

  const profile = writingProfileFromEnv();

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("last_workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  const lastWorkspaceId = (
    profileRow as { last_workspace_id?: string | null } | null
  )?.last_workspace_id;

  if (lastWorkspaceId) {
    const active = await fetchProjectForUser(
      supabase,
      user.id,
      lastWorkspaceId,
    );
    if (active) return active;
  }

  const { data: recent, error: recentErr } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .eq("writing_profile", profile)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentErr) throw recentErr;
  if (recent) {
    await updateLastWorkspaceId(user.id, (recent as Project).id);
    return recent as Project;
  }

  const created = await insertProjectRow(supabase, user.id);
  await updateLastWorkspaceId(user.id, created.id);
  return created;
}

/** @deprecated Use getActiveProject */
export const getOrCreateProject = getActiveProject;

// Whether onboarding has been completed. Phase 0 rule: the user has at least
// one chapter. If they don't, we send them to /onboarding.
export async function isOnboarded(projectId: string): Promise<boolean> {
  const supabase = await supabaseServer();
  const { count } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return (count ?? 0) > 0;
}
