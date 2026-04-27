import { stripHtml } from "@/lib/html";

const NEAR_EMPTY_WORDS = 120;
const SHORT_SCENE_WORDS = 1200;
const LONG_OPENING_WORDS = 450;
const LONG_TRAILING_WORDS = 800;
const PREVIOUS_TRAILING_WORDS = 650;

export type DraftScene = {
  id: string;
  title: string | null;
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
  content: string | null;
  order_index: number | null;
  chapter_id: string;
  blueprint?: unknown;
};

export function buildPartnerDraftContext(input: {
  currentScene: DraftScene;
  previousScene?: DraftScene | null;
}): string {
  const currentPlain = normalizePlain(input.currentScene.content);
  const currentWords = splitWords(currentPlain);
  const lines: string[] = ["DRAFT CONTEXT"];

  if (currentWords.length > 0) {
    lines.push("");
    lines.push(...formatCurrentSceneProse(currentWords));
  }

  if (currentWords.length < NEAR_EMPTY_WORDS && input.previousScene) {
    const previousPlain = normalizePlain(input.previousScene.content);
    const previousWords = splitWords(previousPlain);
    lines.push("");
    lines.push("PREVIOUS SCENE CONTEXT");
    lines.push(`Title: ${input.previousScene.title?.trim() || "(untitled)"}`);
    if (input.previousScene.goal) lines.push(`Goal: ${input.previousScene.goal}`);
    if (input.previousScene.conflict) {
      lines.push(`Conflict: ${input.previousScene.conflict}`);
    }
    if (input.previousScene.outcome) {
      lines.push(`Outcome: ${input.previousScene.outcome}`);
    }
    if (previousWords.length > 0) {
      lines.push("");
      lines.push("Previous scene trailing excerpt:");
      lines.push(takeTrailingWords(previousWords, PREVIOUS_TRAILING_WORDS));
    }
  }

  return lines.join("\n").trim();
}

function formatCurrentSceneProse(words: string[]): string[] {
  if (words.length <= SHORT_SCENE_WORDS) {
    return ["CURRENT SCENE PROSE SO FAR", words.join(" ")];
  }

  return [
    "CURRENT SCENE OPENING EXCERPT",
    words.slice(0, LONG_OPENING_WORDS).join(" "),
    "",
    "[middle prose omitted]",
    "",
    "CURRENT SCENE TRAILING EXCERPT",
    takeTrailingWords(words, LONG_TRAILING_WORDS),
  ];
}

function normalizePlain(html: string | null | undefined): string {
  return stripHtml(html ?? "").replace(/\s+/g, " ").trim();
}

function splitWords(text: string): string[] {
  return text ? text.split(/\s+/).filter(Boolean) : [];
}

function takeTrailingWords(words: string[], count: number): string {
  return words.slice(Math.max(0, words.length - count)).join(" ");
}
