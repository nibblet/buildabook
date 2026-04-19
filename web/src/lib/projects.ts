import { newProjectDefaults, writingProfileFromEnv } from "@/lib/deployment/writing-profile";
import { supabaseServer } from "@/lib/supabase/server";
import { seedBeatsForWritingProfile } from "@/lib/seed/beats";
import type { Project } from "@/lib/supabase/types";

// Returns the user's current project. Auto-creates one on first visit so the
// novice user never sees a "create a project" page. A single-project-per-user
// assumption is fine for Phase 0; we can lift it in "Later."
export async function getOrCreateProject(): Promise<Project | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = writingProfileFromEnv();

  const { data: existing, error: existingErr } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .eq("writing_profile", profile)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return existing as Project;

  const defs = newProjectDefaults(profile);

  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: defs.title,
      subgenre: defs.subgenre,
      heat_level: defs.heat_level,
      target_wordcount: defs.target_wordcount,
      writing_profile: profile,
    })
    .select("*")
    .single();
  if (error) throw error;

  const seedBeats = seedBeatsForWritingProfile(profile);
  if (seedBeats.length) {
    const beatRows = seedBeats.map((b) => ({
      project_id: (created as Project).id,
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

  return created as Project;
}

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
