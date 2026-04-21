import { describe, expect, it, vi } from "vitest";
import { runReflection } from "./reflections";

describe("runReflection pure logic", () => {
  it("skips generation when signatures match", async () => {
    const generator = vi.fn();
    const out = await runReflection({
      existing: {
        id: "r-1",
        body: "cached body",
        input_signature: "abc",
      },
      newSignature: "abc",
      generate: generator,
    });
    expect(generator).not.toHaveBeenCalled();
    expect(out.hit).toBe(true);
    expect(out.body).toBe("cached body");
  });

  it("calls generator when signature changed", async () => {
    const generator = vi.fn().mockResolvedValue({
      body: "fresh body",
      model: "test-model",
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.001,
      aiInteractionId: null,
    });
    const out = await runReflection({
      existing: {
        id: "r-1",
        body: "stale body",
        input_signature: "old",
      },
      newSignature: "new",
      generate: generator,
    });
    expect(generator).toHaveBeenCalledOnce();
    expect(out.hit).toBe(false);
    expect(out.body).toBe("fresh body");
  });

  it("calls generator when nothing cached", async () => {
    const generator = vi.fn().mockResolvedValue({
      body: "first body",
      model: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      aiInteractionId: null,
    });
    const out = await runReflection({
      existing: null,
      newSignature: "first",
      generate: generator,
    });
    expect(generator).toHaveBeenCalledOnce();
    expect(out.hit).toBe(false);
    expect(out.body).toBe("first body");
  });
});
