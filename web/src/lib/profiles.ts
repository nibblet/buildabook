import { supabaseServer } from "@/lib/supabase/server";

export type Profile = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

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
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { profile: existing as Profile, email: user.email ?? null };

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ user_id: user.id })
    .select("*")
    .single();
  if (error) throw error;
  return { profile: created as Profile, email: user.email ?? null };
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
