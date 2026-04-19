import type { WriterStats } from "@/lib/writer-stats";

export type Badge = {
  id: string;
  name: string;
  description: string;
  hint: string;
  group: "words" | "streak" | "sessions" | "milestones";
  isEarned: (s: WriterStats) => boolean;
};

export const BADGES: Badge[] = [
  {
    id: "first_words",
    name: "First Words",
    description: "You wrote your first 100 words.",
    hint: "Write 100 words.",
    group: "words",
    isEarned: (s) => s.totalWords >= 100,
  },
  {
    id: "words_1k",
    name: "1K Club",
    description: "You crossed a thousand words.",
    hint: "Write 1,000 words.",
    group: "words",
    isEarned: (s) => s.totalWords >= 1000,
  },
  {
    id: "words_10k",
    name: "10K Club",
    description: "Ten thousand words on the page.",
    hint: "Write 10,000 words.",
    group: "words",
    isEarned: (s) => s.totalWords >= 10000,
  },
  {
    id: "words_25k",
    name: "Novella",
    description: "A proper novella length.",
    hint: "Write 25,000 words.",
    group: "words",
    isEarned: (s) => s.totalWords >= 25000,
  },
  {
    id: "words_50k",
    name: "NaNo Level",
    description: "Fifty thousand words — the classic milestone.",
    hint: "Write 50,000 words.",
    group: "words",
    isEarned: (s) => s.totalWords >= 50000,
  },
  {
    id: "sprint_500",
    name: "Sprinter",
    description: "You wrote 500 words in a single day.",
    hint: "Write 500 words in one day.",
    group: "words",
    isEarned: (s) => s.bestDayWords >= 500,
  },
  {
    id: "sprint_1k",
    name: "Power Day",
    description: "A thousand words in one day.",
    hint: "Write 1,000 words in one day.",
    group: "words",
    isEarned: (s) => s.bestDayWords >= 1000,
  },
  {
    id: "sprint_2500",
    name: "Marathon",
    description: "2,500 words in a single day.",
    hint: "Write 2,500 words in one day.",
    group: "words",
    isEarned: (s) => s.bestDayWords >= 2500,
  },
  {
    id: "streak_3",
    name: "On a Roll",
    description: "Three days in a row.",
    hint: "Write three days in a row.",
    group: "streak",
    isEarned: (s) => s.longestStreakDays >= 3,
  },
  {
    id: "streak_7",
    name: "Week Warrior",
    description: "A full week of consecutive writing days.",
    hint: "Write seven days in a row.",
    group: "streak",
    isEarned: (s) => s.longestStreakDays >= 7,
  },
  {
    id: "streak_30",
    name: "Month Maker",
    description: "Thirty consecutive days at the page.",
    hint: "Write thirty days in a row.",
    group: "streak",
    isEarned: (s) => s.longestStreakDays >= 30,
  },
  {
    id: "sessions_5",
    name: "Regular",
    description: "Five writing sessions wrapped.",
    hint: "Wrap five writing sessions.",
    group: "sessions",
    isEarned: (s) => s.totalSessions >= 5,
  },
  {
    id: "sessions_25",
    name: "Devoted",
    description: "Twenty-five sessions logged.",
    hint: "Wrap twenty-five writing sessions.",
    group: "sessions",
    isEarned: (s) => s.totalSessions >= 25,
  },
  {
    id: "chapter_done",
    name: "Chapter Complete",
    description: "You finished your first chapter.",
    hint: "Mark a chapter as done.",
    group: "milestones",
    isEarned: (s) => s.chaptersDone >= 1,
  },
  {
    id: "chapters_5",
    name: "Five Chapters",
    description: "Five chapters finished.",
    hint: "Finish five chapters.",
    group: "milestones",
    isEarned: (s) => s.chaptersDone >= 5,
  },
  {
    id: "target_hit",
    name: "Target Hit",
    description: "You reached your target word count.",
    hint: "Reach your target word count.",
    group: "milestones",
    isEarned: (s) =>
      s.targetWordcount > 0 && s.totalWords >= s.targetWordcount,
  },
];

export function evaluateBadges(stats: WriterStats): string[] {
  return BADGES.filter((b) => b.isEarned(stats)).map((b) => b.id);
}

export function getBadge(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}
