import { logAiActivity } from "@/lib/ai/log";
import {
  recountChapterCharacterMentions,
  recountChapterElementMentions,
} from "@/lib/mentions/chapter-mentions";
import { extractWikiLinkNodes } from "@/lib/mentions/wiki-link-mentions";
import { compileProjectWiki } from "@/lib/wiki/compile";
import { supabaseServer } from "@/lib/supabase/server";

/** Coalesce autosave follow-up work to cut Fluid CPU during active writing. */
export const POST_SAVE_DEBOUNCE_MS = 60_000;

type WikiLinkNode = ReturnType<typeof extractWikiLinkNodes>[number];

export type PostSaveScenePipelineDeps = {
  loadScene: (
    sceneId: string,
  ) => Promise<{ chapterId: string | null; content: string | null } | null>;
  loadChapterProjectId: (chapterId: string) => Promise<string | null>;
  recountCharacters: (chapterId: string) => Promise<void>;
  recountElements: (chapterId: string) => Promise<void>;
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
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async function runPostSaveScenePipeline(
    sceneId: string,
    opts?: { compileWiki?: boolean },
  ): Promise<void> {
    const scene = await deps.loadScene(sceneId);
    const chapterId = scene?.chapterId;
    if (!chapterId) return;

    await deps.recountCharacters(chapterId);
    await deps.recountElements(chapterId);

    const projectId = await deps.loadChapterProjectId(chapterId);
    if (projectId) {
      const nodes = deps.extractWikiLinks(scene?.content ?? "");
      if (nodes.length > 0) {
        await deps.logWikiLinks({ projectId, sceneId, chapterId, nodes });
      }
      if (opts?.compileWiki) {
        await deps.compileWiki(projectId);
      }
    }
  }

  function firePostSaveScenePipeline(sceneId: string): void {
    const existing = debounceTimers.get(sceneId);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      sceneId,
      setTimeout(() => {
        debounceTimers.delete(sceneId);
        void runPostSaveScenePipeline(sceneId).catch(deps.onError);
      }, POST_SAVE_DEBOUNCE_MS),
    );
  }

  async function runPostImportScenePipeline(sceneIds: string[]): Promise<void> {
    for (const sceneId of sceneIds) {
      await runPostSaveScenePipeline(sceneId, { compileWiki: true });
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

/** Non-blocking hooks after prose autosave (mention recount only; wiki compile is manual). */
export const firePostSaveScenePipeline =
  defaultPipeline.firePostSaveScenePipeline;
