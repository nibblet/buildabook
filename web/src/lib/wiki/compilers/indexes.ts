import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";

export type ThreadRow = {
  id: string;
  question: string;
  resolved: boolean;
  opened_chapter_title: string | null;
  resolved_chapter_title: string | null;
};

export function compileThreadsIndex(input: {
  threads: ThreadRow[];
}): CompiledDoc {
  const open = input.threads.filter((t) => !t.resolved);
  const resolved = input.threads.filter((t) => t.resolved);

  const lines: string[] = [];
  lines.push("# Open threads");
  lines.push("");

  lines.push("## Open");
  if (open.length === 0) {
    lines.push("- (none)");
  } else {
    for (const t of open) {
      const where = t.opened_chapter_title
        ? ` — opened in ${t.opened_chapter_title}`
        : "";
      lines.push(`- ${t.question}${where}`);
    }
  }
  lines.push("");

  lines.push("## Resolved");
  if (resolved.length === 0) {
    lines.push("- (none)");
  } else {
    for (const t of resolved) {
      const opened = t.opened_chapter_title
        ? ` — opened in ${t.opened_chapter_title}`
        : "";
      const closed = t.resolved_chapter_title
        ? `, resolved in ${t.resolved_chapter_title}`
        : "";
      lines.push(`- ${t.question}${opened}${closed}`);
    }
  }

  const payload = {
    threads: [...input.threads].sort((a, b) => a.id.localeCompare(b.id)),
  };

  return {
    title: "Open threads",
    bodyMd: lines.join("\n").trim() + "\n",
    sourceSignature: computeSignature(payload),
    sourceRefs: { thread_ids: input.threads.map((t) => t.id) },
  };
}

export type StorylineChapter = {
  id: string;
  title: string | null;
  order: number;
  status: string;
  wordcount: number;
  synopsis: string | null;
  scenes: Array<{
    id: string;
    title: string | null;
    order: number;
    goal: string | null;
    status: string;
  }>;
};

export type StorylineBeat = {
  title: string;
  act: number | null;
  why_it_matters: string | null;
};

export function compileStorylineIndex(input: {
  chapters: StorylineChapter[];
  beats: StorylineBeat[];
}): CompiledDoc {
  const chapters = [...input.chapters].sort((a, b) => a.order - b.order);
  const beats = [...input.beats];

  const lines: string[] = [];
  lines.push("# Storyline");
  lines.push("");

  if (beats.length) {
    lines.push("## Beats");
    for (const b of beats) {
      const act = b.act ? ` (Act ${b.act})` : "";
      const why = b.why_it_matters ? ` — ${b.why_it_matters}` : "";
      lines.push(`- ${b.title}${act}${why}`);
    }
    lines.push("");
  }

  lines.push("## Chapters");
  for (const ch of chapters) {
    const title = ch.title || `Chapter ${ch.order + 1}`;
    lines.push(
      `### ${title} · ${ch.status} · ${ch.wordcount} words`,
    );
    if (ch.synopsis) lines.push(ch.synopsis);
    const scenes = [...ch.scenes].sort((a, b) => a.order - b.order);
    for (const s of scenes) {
      const stitle = s.title || `Scene ${s.order + 1}`;
      const goal = s.goal ? ` — ${s.goal}` : "";
      lines.push(`- ${stitle} (${s.status})${goal}`);
    }
    lines.push("");
  }

  const payload = {
    chapters: chapters.map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      status: c.status,
      wordcount: c.wordcount,
      synopsis: c.synopsis,
      scenes: [...c.scenes].sort((a, b) => a.order - b.order),
    })),
    beats,
  };

  return {
    title: "Storyline",
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(payload),
    sourceRefs: {
      chapter_ids: chapters.map((c) => c.id),
    },
  };
}
