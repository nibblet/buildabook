import type { SpineData } from "@/lib/spine";

export type NextActionItem = {
  key: string;
  label: string;
  href: string;
};

export type StaleThread = {
  id: string;
  question: string;
  created_at: string;
  opened_in_scene_id: string | null;
};

export type NextActionContext = {
  relationshipCount: number;
  characterCount: number;
  staleThreads?: StaleThread[];
};

const STALE_MS = 5 * 24 * 60 * 60 * 1000;

/** Opinionated queue of next steps — deduped by href, capped for the dashboard. */
export function buildNextActions(
  spine: SpineData,
  currentBeatId: string | null,
  ctx?: NextActionContext,
): NextActionItem[] {
  const seen = new Set<string>();
  const out: NextActionItem[] = [];

  function push(item: NextActionItem) {
    if (seen.has(item.href)) return;
    seen.add(item.href);
    out.push(item);
  }

  const now = Date.now();
  if (ctx?.staleThreads?.length) {
    for (const t of ctx.staleThreads) {
      if (now - new Date(t.created_at).getTime() < STALE_MS) continue;
      const href = t.opened_in_scene_id
        ? `/scenes/${t.opened_in_scene_id}`
        : "/";
      const q = t.question.trim();
      const short = q.length > 56 ? `${q.slice(0, 54)}…` : q;
      push({
        key: `thread-age-${t.id}`,
        label: `Open thread waiting a while: ${short}`,
        href,
      });
      if (out.length >= 2) break;
    }
  }

  const drafting = spine.scenes.find((s) => s.status === "drafting");
  if (drafting) {
    push({
      key: "resume-draft",
      label: "Continue the scene you were drafting",
      href: `/scenes/${drafting.id}`,
    });
  }

  const plannedEmpty = spine.scenes
    .filter((s) => s.status === "planned" && (s.wordcount ?? 0) === 0)
    .sort((a, b) => {
      const ca = spine.chapters.find((c) => c.id === a.chapter_id);
      const cb = spine.chapters.find((c) => c.id === b.chapter_id);
      const ai =
        (ca?.order_index ?? 0) * 1000 + (a.order_index ?? 0);
      const bi =
        (cb?.order_index ?? 0) * 1000 + (b.order_index ?? 0);
      return ai - bi;
    });
  const firstPlanned = plannedEmpty[0];
  if (firstPlanned) {
    push({
      key: "draft-planned",
      label: "Start drafting your next planned scene",
      href: `/scenes/${firstPlanned.id}`,
    });
  }

  const nextEmptyBeat = spine.beats.find((b) => b.coverage === "empty");
  if (nextEmptyBeat) {
    push({
      key: "sketch-beat",
      label: `Sketch the first scene for “${nextEmptyBeat.title}”`,
      href: `/beats/${nextEmptyBeat.id}`,
    });
  }

  if (currentBeatId) {
    push({
      key: "beat-detail",
      label: "Open the beat you’re working on",
      href: `/beats/${currentBeatId}`,
    });
  }

  if (
    ctx &&
    ctx.characterCount >= 2 &&
    ctx.relationshipCount === 0
  ) {
    push({
      key: "relationships",
      label: "Track how your leads connect",
      href: "/relationships/new",
    });
  }

  if (ctx && ctx.characterCount === 0) {
    push({
      key: "characters",
      label: "Add your cast on the Characters page",
      href: "/characters",
    });
  }

  push({
    key: "spine",
    label: "Review or reorder your story spine",
    href: "/spine",
  });

  if (out.length <= 4) {
    const recentDone = [...spine.scenes]
      .filter((s) => s.status === "done")
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() -
          new Date(a.updated_at).getTime(),
      );
    const lastDone = recentDone[0];
    if (lastDone) {
      push({
        key: "review-done",
        label: "Re-read or tweak a scene you marked done",
        href: `/scenes/${lastDone.id}`,
      });
    }
  }

  const hasSceneHref = [...seen].some((h) => h.startsWith("/scenes/"));
  if (!hasSceneHref && spine.scenes[0]) {
    push({
      key: "open-scene",
      label: "Jump into a scene",
      href: `/scenes/${spine.scenes[0].id}`,
    });
  }

  return out.slice(0, 5);
}
