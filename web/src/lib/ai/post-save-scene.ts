import { extractContinuity } from "@/lib/ai/continuity/extract";
import { logAiActivity } from "@/lib/ai/log";
import { maybeProposeRelationshipBeat } from "@/lib/ai/relationship-beat-proposal";
import {
  recountChapterCharacterMentions,
  recountChapterElementMentions,
} from "@/lib/mentions/chapter-mentions";
import { extractWikiLinkNodes } from "@/lib/mentions/wiki-link-mentions";
import { compileProjectWiki } from "@/lib/wiki/compile";
import { supabaseServer } from "@/lib/supabase/server";

/** Non-blocking hooks after prose save (mentions, continuity, wiki compile). */
export function firePostSaveScenePipeline(sceneId: string): void {
  void (async () => {
    try {
      const supabase = await supabaseServer();
      const { data: sc } = await supabase
        .from("scenes")
        .select("chapter_id, content")
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
        const nodes = extractWikiLinkNodes(sc?.content ?? "");
        if (nodes.length > 0) {
          await logAiActivity({
            projectId: ch.project_id,
            kind: "scene_wiki_links",
            summary: `Scene ${sceneId} has ${nodes.length} wiki links`,
            detail: { sceneId, chapterId, nodes },
          });
        }
        await compileProjectWiki(ch.project_id);
      }
    } catch (e) {
      console.error("post-save scene pipeline:", e);
    }
  })();
}
