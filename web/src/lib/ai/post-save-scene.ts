import { extractContinuity } from "@/lib/ai/continuity/extract";
import { maybeProposeRelationshipBeat } from "@/lib/ai/relationship-beat-proposal";
import { rebuildSceneChunks } from "@/lib/ai/scene-chunks";
import {
  recountChapterCharacterMentions,
  recountChapterElementMentions,
} from "@/lib/mentions/chapter-mentions";
import { supabaseServer } from "@/lib/supabase/server";

/** Non-blocking Phase 2 hooks after prose save (embeddings, mentions, proposals). */
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

      await rebuildSceneChunks(sceneId);
      await recountChapterCharacterMentions(chapterId);
      await recountChapterElementMentions(chapterId);
      await maybeProposeRelationshipBeat(sceneId);
      await extractContinuity(sceneId);
    } catch (e) {
      console.error("post-save scene pipeline:", e);
    }
  })();
}
