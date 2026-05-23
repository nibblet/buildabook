import { describe, expect, it } from "vitest";
import { createPostSaveScenePipeline } from "./post-save-scene";

describe("createPostSaveScenePipeline", () => {
  it("runs imported scenes sequentially through the awaitable pipeline", async () => {
    const events: string[] = [];
    const pipeline = createPostSaveScenePipeline({
      loadScene: async (sceneId) => {
        events.push(`load:${sceneId}`);
        return { chapterId: `chapter-${sceneId}`, content: "<p>Mara arrived.</p>" };
      },
      loadChapterProjectId: async (chapterId) => `project-${chapterId}`,
      recountCharacters: async (chapterId) => {
        events.push(`characters:${chapterId}`);
      },
      recountElements: async (chapterId) => {
        events.push(`elements:${chapterId}`);
      },
      extractWikiLinks: () => [],
      logWikiLinks: async () => {
        events.push("wiki-log");
      },
      compileWiki: async (projectId) => {
        events.push(`compile:${projectId}`);
      },
      onError: () => {
        events.push("error");
      },
    });

    await pipeline.runPostImportScenePipeline(["s1", "s2"]);

    expect(events).toEqual([
      "load:s1",
      "characters:chapter-s1",
      "elements:chapter-s1",
      "compile:project-chapter-s1",
      "load:s2",
      "characters:chapter-s2",
      "elements:chapter-s2",
      "compile:project-chapter-s2",
    ]);
  });

  it("keeps the editor fire path non-blocking", async () => {
    const events: string[] = [];
    let releaseLoad: (() => void) | null = null;
    const pipeline = createPostSaveScenePipeline({
      loadScene: async () => {
        events.push("load:start");
        await new Promise<void>((resolve) => {
          releaseLoad = resolve;
        });
        events.push("load:end");
        return { chapterId: "chapter-1", content: "" };
      },
      loadChapterProjectId: async () => "project-1",
      recountCharacters: async () => {
        events.push("characters");
      },
      recountElements: async () => {
        events.push("elements");
      },
      extractWikiLinks: () => [],
      logWikiLinks: async () => {
        events.push("wiki-log");
      },
      compileWiki: async () => {
        events.push("compile");
      },
      onError: () => {
        events.push("error");
      },
    });

    expect(pipeline.firePostSaveScenePipeline("s1")).toBeUndefined();
    await Promise.resolve();
    expect(events).toEqual(["load:start"]);

    if (releaseLoad) releaseLoad();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toContain("compile");
  });

  it("propagates failures when import callers await the pipeline", async () => {
    const pipeline = createPostSaveScenePipeline({
      loadScene: async () => {
        throw new Error("scene lookup failed");
      },
      loadChapterProjectId: async () => "project-1",
      recountCharacters: async () => {},
      recountElements: async () => {},
      extractWikiLinks: () => [],
      logWikiLinks: async () => {},
      compileWiki: async () => {},
      onError: () => {},
    });

    await expect(pipeline.runPostImportScenePipeline(["s1"])).rejects.toThrow(
      "scene lookup failed",
    );
  });
});
