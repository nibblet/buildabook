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

type WikiLinkNode = ReturnType<typeof extractWikiLinkNodes>[number];

export type PostSaveScenePipelineDeps = {
  loadScene: (
    sceneId: string,
  ) => Promise<{ chapterId: string | null; content: string | null } | null>;
  loadChapterProjectId: (chapterId: string) => Promise<string | null>;
  recountCharacters: (chapterId: string) => Promise<void>;
  recountElements: (chapterId: string) => Promise<void>;
  proposeRelationshipBeat: (sceneId: string) => Promise<void>;
  extractContinuity: (sceneId: string) => Promise<void>;
  extractWikiLinks: (content: string) => WikiLinkNode[];
  logWikiLinks: (args: {
    projectId: string;
    sceneId: string;
    chapterId: string;
    nodes: WikiLinkNode[];
  }) => Promise<void>;
  compileWiki: (projectId: string) => Promise<void>;
  onError: (error: unknown) => void;
};

export function createPostSaveScenePipeline(deps: PostSaveScenePipelineDeps) {
  async function runPostSaveScenePipeline(sceneId: string): Promise<void> {
    const scene = await deps.loadScene(sceneId);
    const chapterId = scene?.chapterId;
    if (!chapterId) return;

    await deps.recountCharacters(chapterId);
    await deps.recountElements(chapterId);
    await deps.proposeRelationshipBeat(sceneId);
    await deps.extractContinuity(sceneId);

    const projectId = await deps.loadChapterProjectId(chapterId);
    if (projectId) {
      const nodes = deps.extractWikiLinks(scene?.content ?? "");
      if (nodes.length > 0) {
        await deps.logWikiLinks({ projectId, sceneId, chapterId, nodes });
      }
      await deps.compileWiki(projectId);
    }
  }

  function firePostSaveScenePipeline(sceneId: string): void {
    void runPostSaveScenePipeline(sceneId).catch(deps.onError);
  }

  async function runPostImportScenePipeline(sceneIds: string[]): Promise<void> {
    for (const sceneId of sceneIds) {
      await runPostSaveScenePipeline(sceneId);
    }
  }

  return {
    runPostSaveScenePipeline,
    firePostSaveScenePipeline,
    runPostImportScenePipeline,
  };
}

const defaultPipeline = createPostSaveScenePipeline({
  loadScene: async (sceneId) => {
    const supabase = await supabaseServer();
    const { data: scene, error } = await supabase
      .from("scenes")
      .select("chapter_id, content")
      .eq("id", sceneId)
      .maybeSingle();
    if (error) throw error;
    return {
      chapterId: scene?.chapter_id ?? null,
      content: scene?.content ?? null,
    };
  },
  loadChapterProjectId: async (chapterId) => {
    const supabase = await supabaseServer();
    const { data: chapter, error } = await supabase
      .from("chapters")
      .select("project_id")
      .eq("id", chapterId)
      .maybeSingle();
    if (error) throw error;
    return chapter?.project_id ?? null;
  },
  recountCharacters: recountChapterCharacterMentions,
  recountElements: recountChapterElementMentions,
  proposeRelationshipBeat: maybeProposeRelationshipBeat,
  extractContinuity,
  extractWikiLinks: extractWikiLinkNodes,
  logWikiLinks: async ({ projectId, sceneId, chapterId, nodes }) => {
    await logAiActivity({
      projectId,
      kind: "scene_wiki_links",
      summary: `Scene ${sceneId} has ${nodes.length} wiki links`,
      detail: { sceneId, chapterId, nodes },
    });
  },
  compileWiki: async (projectId) => {
    await compileProjectWiki(projectId);
  },
  onError: (error) => console.error("post-save scene pipeline:", error),
});

export const runPostSaveScenePipeline =
  defaultPipeline.runPostSaveScenePipeline;
export const runPostImportScenePipeline =
  defaultPipeline.runPostImportScenePipeline;

/** Non-blocking hooks after prose save (mentions, continuity, wiki compile). */
export const firePostSaveScenePipeline =
  defaultPipeline.firePostSaveScenePipeline;
