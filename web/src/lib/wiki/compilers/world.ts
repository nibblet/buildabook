import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";
import type { WorldElement } from "@/lib/supabase/types";

export type WorldCitation = {
  scene_id: string;
  chapter_id: string;
  chapter_order: number;
  scene_order: number;
  chapter_title: string | null;
  mention_count: number;
};

export type CompileWorldInput = {
  element: WorldElement;
  citations: WorldCitation[];
};

export function compileWorldElement(input: CompileWorldInput): CompiledDoc {
  const { element: w, citations } = input;

  const orderedCitations = [...citations].sort(
    (a, b) =>
      a.chapter_order - b.chapter_order || a.scene_order - b.scene_order,
  );

  const lines: string[] = [];
  lines.push(`# ${w.name || "Untitled element"}`);
  lines.push("");

  const meta: string[] = [];
  if (w.category) meta.push(`**Category:** ${w.category}`);
  if (w.aliases?.length) meta.push(`**Also known as:** ${w.aliases.join(", ")}`);
  if (meta.length) {
    lines.push(meta.join("  "));
    lines.push("");
  }

  if (w.description) {
    lines.push(w.description);
    lines.push("");
  }

  const metadataEntries = Object.entries(w.metadata ?? {});
  if (metadataEntries.length) {
    lines.push("## Facts");
    for (const [k, v] of metadataEntries.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- **${k}:** ${String(v)}`);
    }
    lines.push("");
  }

  if (orderedCitations.length) {
    lines.push("## Cited in");
    for (const c of orderedCitations) {
      const title = c.chapter_title || `Chapter ${c.chapter_order + 1}`;
      const times = c.mention_count > 1 ? ` (×${c.mention_count})` : "";
      lines.push(`- ${title}${times}`);
    }
    lines.push("");
  }

  const signaturePayload = {
    element: {
      id: w.id,
      name: w.name,
      category: w.category,
      description: w.description,
      aliases: [...(w.aliases ?? [])].sort(),
      metadata: w.metadata ?? {},
    },
    citations: orderedCitations.map((c) => ({
      scene_id: c.scene_id,
      chapter_id: c.chapter_id,
      chapter_order: c.chapter_order,
      scene_order: c.scene_order,
      mention_count: c.mention_count,
    })),
  };

  return {
    title: w.name || "Untitled element",
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(signaturePayload),
    sourceRefs: {
      world_element_id: w.id,
      scene_ids: orderedCitations.map((c) => c.scene_id),
    },
  };
}
