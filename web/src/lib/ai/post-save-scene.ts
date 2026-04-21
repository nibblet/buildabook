import { extractContinuity } from "@/lib/ai/continuity/extract";
import { maybeProposeRelationshipBeat } from "@/lib/ai/relationship-beat-proposal";
import {
  recountChapterCharacterMentions,
  recountChapterElementMentions,
} from "@/lib/mentions/chapter-mentions";
import { compileProjectWiki } from "@/lib/wiki/compile";
import { supabaseServer } from "@/lib/supabase/server";

/** Non-blocking hooks after prose save (mentions, continuity, wiki compile). */
export function firePostSaveScenePipeline(sceneId: string): void {
  void (async () => {
    try {
      const supabase = await supabaseServer();
      const { data: sc } = await supabase
        .from("scenes")
        .select("chapter_id")
        .eq("id", sceneId)
        .maybeSingle();
      const chapterId = sc?.chapter_id;
      if (!chapterId) return;

      await recountChapterCharacterMentions(chapterId);
      await recountChapterElementMentions(chapterId);
      await maybeProposeRelationshipBeat(sceneId);
      await extractContinuity(sceneId);

      const { data: ch } = await supabase
        .from("chapters")
        .select("project_id")
        .eq("id", chapterId)
        .maybeSingle();
      if (ch?.project_id) {
        await compileProjectWiki(ch.project_id);
      }
    } catch (e) {
      console.error("post-save scene pipeline:", e);
    }
  })();
}
