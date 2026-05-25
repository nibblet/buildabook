import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPostSaveScenePipeline,
  POST_SAVE_DEBOUNCE_MS,
} from "./post-save-scene";

describe("createPostSaveScenePipeline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("debounces mention recount on autosave without compiling wiki", async () => {
    vi.useFakeTimers();
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
    expect(events).toEqual([]);

    vi.advanceTimersByTime(POST_SAVE_DEBOUNCE_MS - 1);
    await Promise.resolve();
    expect(events).toEqual([]);

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(events).toEqual(["load:start"]);

    if (releaseLoad) releaseLoad();
    await Promise.resolve();
    await vi.runAllTimersAsync();
    expect(events).toContain("characters");
    expect(events).not.toContain("compile");
    vi.useRealTimers();
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
