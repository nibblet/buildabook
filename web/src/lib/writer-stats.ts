import { supabaseServer } from "@/lib/supabase/server";

export type WriterStats = {
  totalWords: number;
  targetWordcount: number;
  progressPct: number;
  totalSessions: number;
  sessionsThisWeek: number;
  currentStreakDays: number;
  longestStreakDays: number;
  bestDayWords: number;
  wordsThisWeek: number;
  chaptersDone: number;
  chaptersTotal: number;
};

const MS_PER_DAY = 86_400_000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function streakFromDays(dayKeys: Set<string>): {
  current: number;
  longest: number;
} {
  if (dayKeys.size === 0) return { current: 0, longest: 0 };

  const sorted = Array.from(dayKeys).sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = Date.parse(sorted[i - 1] + "T00:00:00Z");
    const curr = Date.parse(sorted[i] + "T00:00:00Z");
    if (curr - prev === MS_PER_DAY) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  let current = 0;
  if (dayKeys.has(todayKey) || dayKeys.has(yesterdayKey)) {
    let cursor = dayKeys.has(todayKey) ? todayKey : yesterdayKey;
    while (dayKeys.has(cursor)) {
      current += 1;
      cursor = new Date(Date.parse(cursor + "T00:00:00Z") - MS_PER_DAY)
        .toISOString()
        .slice(0, 10);
    }
  }
  return { current, longest };
}

export async function getWriterStats(projectId: string): Promise<WriterStats> {
  const supabase = await supabaseServer();

  const [projectRes, chaptersRes, scenesRes, sessionsRes, revisionsRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select("target_wordcount")
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("chapters")
        .select("id,status")
        .eq("project_id", projectId),
      supabase
        .from("scenes")
        .select("id,wordcount,chapter_id,chapters!inner(project_id)")
        .eq("chapters.project_id", projectId),
      supabase
        .from("sessions")
        .select("ended_at")
        .eq("project_id", projectId),
      supabase
        .from("scene_revisions")
        .select("wordcount,created_at,scene_id,scenes!inner(chapter_id,chapters!inner(project_id))")
        .eq("scenes.chapters.project_id", projectId)
        .order("created_at", { ascending: true }),
    ]);

  const targetWordcount =
    (projectRes.data as { target_wordcount: number } | null)
      ?.target_wordcount ?? 0;

  const chapters = (chaptersRes.data ?? []) as Array<{
    id: string;
    status: string;
  }>;
  const chaptersDone = chapters.filter((c) => c.status === "done").length;
  const chaptersTotal = chapters.length;

  const scenes = (scenesRes.data ?? []) as Array<{
    id: string;
    wordcount: number | null;
  }>;
  const totalWords = scenes.reduce<number>(
    (sum, s) => sum + (s.wordcount ?? 0),
    0,
  );

  const sessions = (sessionsRes.data ?? []) as Array<{ ended_at: string }>;
  const totalSessions = sessions.length;
  const weekAgo = Date.now() - 7 * MS_PER_DAY;
  const sessionsThisWeek = sessions.filter(
    (s) => Date.parse(s.ended_at) >= weekAgo,
  ).length;

  const sessionDayKeys = new Set<string>(sessions.map((s) => dayKey(s.ended_at)));
  const { current: currentStreakDays, longest: longestStreakDays } =
    streakFromDays(sessionDayKeys);

  // Derive per-day word growth from scene_revisions: for each scene track its
  // prior wordcount and count the positive delta on the revision's day.
  const revisions = (revisionsRes.data ?? []) as Array<{
    wordcount: number | null;
    created_at: string;
    scene_id: string;
  }>;
  const lastBySceneId = new Map<string, number>();
  const deltaByDay = new Map<string, number>();
  for (const r of revisions) {
    const prev = lastBySceneId.get(r.scene_id) ?? 0;
    const curr = r.wordcount ?? 0;
    const delta = Math.max(0, curr - prev);
    lastBySceneId.set(r.scene_id, curr);
    if (delta > 0) {
      const k = dayKey(r.created_at);
      deltaByDay.set(k, (deltaByDay.get(k) ?? 0) + delta);
    }
  }
  let bestDayWords = 0;
  let wordsThisWeek = 0;
  const weekAgoKey = new Date(weekAgo).toISOString().slice(0, 10);
  for (const [k, v] of deltaByDay) {
    if (v > bestDayWords) bestDayWords = v;
    if (k >= weekAgoKey) wordsThisWeek += v;
  }

  const progressPct =
    targetWordcount > 0
      ? Math.min(100, Math.round((totalWords / targetWordcount) * 100))
      : 0;

  return {
    totalWords,
    targetWordcount,
    progressPct,
    totalSessions,
    sessionsThisWeek,
    currentStreakDays,
    longestStreakDays,
    bestDayWords,
    wordsThisWeek,
    chaptersDone,
    chaptersTotal,
  };
}
