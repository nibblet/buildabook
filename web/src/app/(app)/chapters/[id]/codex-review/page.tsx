import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { CodexReviewClient } from "./codex-review-client";
import type { ContinuityClaim } from "@/lib/supabase/types";

export default async function CodexReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chapterId } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, project_id")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter || chapter.project_id !== project.id) notFound();

  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, title, order_index")
    .eq("chapter_id", chapterId)
    .order("order_index");

  const sceneIds = (scenes ?? []).map((s) => s.id);
  let claims: ContinuityClaim[] = [];
  if (sceneIds.length) {
    const { data: rows } = await supabase
      .from("continuity_claims")
      .select("*")
      .in("source_scene_id", sceneIds)
      .eq("status", "auto")
      .order("created_at", { ascending: false });
    claims = (rows ?? []) as ContinuityClaim[];
  }

  const [{ data: characters }, { data: worlds }, { data: relationships }] =
    await Promise.all([
      supabase
        .from("characters")
        .select("id, name, aliases")
        .eq("project_id", project.id)
        .order("name"),
      supabase
        .from("world_elements")
        .select("id, name, category, aliases")
        .eq("project_id", project.id)
        .order("name"),
      supabase
        .from("relationships")
        .select("id, type, current_state, char_a_id, char_b_id")
        .eq("project_id", project.id),
    ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <CodexReviewClient
        chapterId={chapterId}
        chapterTitle={chapter.title}
        claims={claims}
        scenes={(scenes ?? []) as { id: string; title: string | null; order_index: number | null }[]}
        characters={(characters ?? []) as {
          id: string;
          name: string | null;
          aliases: string[] | null;
        }[]}
        worlds={(worlds ?? []) as {
          id: string;
          name: string | null;
          category: string | null;
          aliases: string[] | null;
        }[]}
        relationships={(relationships ?? []) as {
          id: string;
          type: string | null;
          current_state: string | null;
          char_a_id: string | null;
          char_b_id: string | null;
        }[]}
      />
      <p className="mt-10 text-center text-xs text-muted-foreground">
        <Link href={`/chapters/${chapterId}`} className="underline-offset-4 hover:underline">
          Chapter overview
        </Link>
      </p>
    </div>
  );
}
