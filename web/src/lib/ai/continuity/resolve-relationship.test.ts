import { describe, expect, it } from "vitest";
import {
  findRelationshipForPair,
  relationshipPairKey,
} from "./resolve-relationship";

describe("relationshipPairKey", () => {
  it("uses stable ordering", () => {
    expect(relationshipPairKey("b", "a")).toBe("a:b");
    expect(relationshipPairKey("a", "b")).toBe("a:b");
  });
});

describe("findRelationshipForPair", () => {
  const rows = [
    { id: "r1", char_a_id: "c1", char_b_id: "c2" },
    { id: "r2", char_a_id: "c3", char_b_id: "c4" },
  ];

  it("finds a relationship regardless of stored character order", () => {
    expect(findRelationshipForPair(rows, "c2", "c1")).toEqual({
      id: "r1",
      char_a_id: "c1",
      char_b_id: "c2",
    });
  });

  it("returns null when either character is missing", () => {
    expect(findRelationshipForPair(rows, "c1", null)).toBeNull();
  });

  it("returns null when no pair exists", () => {
    expect(findRelationshipForPair(rows, "c1", "c4")).toBeNull();
  });
});
