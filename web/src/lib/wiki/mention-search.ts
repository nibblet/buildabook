import { supabaseServer } from "@/lib/supabase/server";
import type { WikiDocType } from "@/lib/supabase/types";
import { entitySlug } from "@/lib/wiki/signature";

export type MentionTargetType = WikiDocType;

export type MentionCandidate = {
  targetType: MentionTargetType;
  targetKey: string;
  display: string;
};

type MergeInput = {
  chars: MentionCandidate[];
  worlds: MentionCandidate[];
  docs: MentionCandidate[];
};

export function mergeMentionCandidates({
  chars,
  worlds,
  docs,
}: MergeInput): MentionCandidate[] {
  const key = (c: MentionCandidate) => `${c.targetType}:${c.targetKey}`;
  const seen = new Map<string, MentionCandidate>();
  for (const c of [...chars, ...worlds]) seen.set(key(c), c);
  for (const d of docs) if (!seen.has(key(d))) seen.set(key(d), d);
  return [...seen.values()].sort((a, b) =>
    a.display.localeCompare(b.display, undefined, { sensitivity: "base" }),
  );
}

/** Called from the client suggestion plugin via a server action. */
export async function searchMentionCandidates(
  projectId: string,
  query: string,
  limit = 8,
): Promise<MentionCandidate[]> {
  const supabase = await supabaseServer();
  const q = query.trim();
  const ilike = q ? `%${q}%` : "%";

  const [{ data: chars }, { data: worlds }, { data: docs }] = await Promise.all(
    [
      supabase
        .from("characters")
        .select("name")
        .eq("project_id", projectId)
        .ilike("name", ilike)
        .limit(limit),
      supabase
        .from("world_elements")
        .select("name")
        .eq("project_id", projectId)
        .ilike("name", ilike)
        .limit(limit),
      supabase
        .from("wiki_documents")
        .select("doc_type, doc_key, title")
        .eq("project_id", projectId)
        .eq("status", "current")
        .in("doc_type", ["relationship", "thread", "storyline", "index"])
        .ilike("title", ilike)
        .limit(limit),
    ],
  );

  const merged = mergeMentionCandidates({
    chars: (chars ?? []).map((c) => ({
      targetType: "character" as const,
      targetKey: entitySlug(c.name),
      display: c.name,
    })),
    worlds: (worlds ?? []).map((w) => ({
      targetType: "world" as const,
      targetKey: entitySlug(w.name),
      display: w.name,
    })),
    docs: (docs ?? []).map((d) => ({
      targetType: d.doc_type as MentionTargetType,
      targetKey: d.doc_key,
      display: d.title || d.doc_key,
    })),
  });

  return merged.slice(0, limit);
}
