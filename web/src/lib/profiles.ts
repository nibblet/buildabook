import { supabaseServer } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  last_workspace_id: string | null;
  created_at: string;
  updated_at: string;
};

const PROFILE_COLUMNS =
  "id, full_name, bio, avatar_url, last_workspace_id, created_at, updated_at";

export async function getOrCreateProfile(): Promise<{
  profile: Profile;
  email: string | null;
} | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  if (existing)
    return { profile: existing as Profile, email: user.email ?? null };

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ id: user.id })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return { profile: created as Profile, email: user.email ?? null };
}

export async function updateLastWorkspaceId(
  userId: string,
  projectId: string,
): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("profiles")
    .update({ last_workspace_id: projectId })
    .eq("id", userId);
  if (error) throw error;
}

export async function getEarnedBadgeIds(userId: string): Promise<Set<string>> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId);
  const rows = (data ?? []) as Array<{ badge_id: string }>;
  return new Set<string>(rows.map((r) => r.badge_id));
}

export async function awardBadges(
  userId: string,
  badgeIds: string[],
): Promise<void> {
  if (badgeIds.length === 0) return;
  const supabase = await supabaseServer();
  const rows = badgeIds.map((id) => ({ user_id: userId, badge_id: id }));
  await supabase.from("user_badges").upsert(rows, {
    onConflict: "user_id,badge_id",
    ignoreDuplicates: true,
  });
}
