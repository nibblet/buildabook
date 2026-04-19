import { describe, expect, it } from "vitest";
import { transactionBurstForSprint } from "./use-typing-sprint";

describe("transactionBurstForSprint", () => {
  it("returns false when below threshold", () => {
    const now = 1_000_000;
    const stamps = Array.from({ length: 10 }, (_, i) => now - i * 1000);
    expect(transactionBurstForSprint(stamps, now)).toBe(false);
  });

  it("returns true when many timestamps in window", () => {
    const now = 2_000_000;
    const stamps = Array.from({ length: 50 }, (_, i) => now - i * 500);
    expect(transactionBurstForSprint(stamps, now)).toBe(true);
  });
});
