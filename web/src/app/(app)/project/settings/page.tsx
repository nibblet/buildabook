import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOrCreateProject } from "@/lib/projects";
import { supabaseServer } from "@/lib/supabase/server";
import { evaluateBadges } from "@/lib/badges";
import {
  awardBadges,
  getEarnedBadgeIds,
  getOrCreateProfile,
} from "@/lib/profiles";
import { getWriterStats } from "@/lib/writer-stats";
import { SettingsTabs } from "./settings-tabs";
import type { StyleSample } from "@/lib/supabase/types";

export default async function ProjectSettingsPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const profileResult = await getOrCreateProfile();
  if (!profileResult) redirect("/login");
  const { profile, email } = profileResult;

  const supabase = await supabaseServer();
  const [{ data: samples }, stats] = await Promise.all([
    supabase
      .from("style_samples")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    getWriterStats(project.id),
  ]);

  const newlyEarned = evaluateBadges(stats);
  const previouslyEarned = await getEarnedBadgeIds(profile.id);
  const toAward = newlyEarned.filter((id) => !previouslyEarned.has(id));
  if (toAward.length) await awardBadges(profile.id, toAward);
  const earnedBadgeIds = Array.from(
    new Set([...previouslyEarned, ...newlyEarned]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" /> Back to dashboard
        </Link>
        <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Project
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Settings
        </h1>
      </div>
      <SettingsTabs
        profile={profile}
        email={email}
        stats={stats}
        earnedBadgeIds={earnedBadgeIds}
        project={project}
        styleSamples={(samples ?? []) as StyleSample[]}
      />
    </div>
  );
}
