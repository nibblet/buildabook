import { describe, expect, it } from "vitest";
import { resolveSubject } from "./resolve-subject";

describe("resolveSubject", () => {
  const chars = [
    { id: "c1", name: "Elena Vale", aliases: ["El"] },
    { id: "c2", name: "Marcus Thorn", aliases: [] },
    { id: "c3", name: "Ava Larent", aliases: [] },
    { id: "c4", name: "Ava Morgan", aliases: [] },
  ];
  const worlds = [{ id: "w1", name: "The Hollow", aliases: ["Hollow"] }];

  it("matches UUID hint on character", () => {
    expect(resolveSubject("x", "c1", chars, worlds)).toMatchObject({
      subject_character_id: "c1",
      subject_world_element_id: null,
      resolution_status: "resolved",
    });
  });

  it("matches exact character name", () => {
    expect(resolveSubject("Marcus Thorn", null, chars, worlds)).toMatchObject({
      subject_character_id: "c2",
      subject_world_element_id: null,
      resolution_status: "resolved",
    });
  });

  it("matches alias", () => {
    expect(resolveSubject("El", null, chars, worlds)).toMatchObject({
      subject_character_id: "c1",
      subject_world_element_id: null,
      resolution_status: "resolved",
    });
  });

  it("suggests a unique first-name character without auto-linking", () => {
    expect(resolveSubject("Marcus", null, chars, worlds)).toEqual({
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "candidate",
      resolution_note: "Possible character match: Marcus Thorn",
      candidates: [
        { type: "character", id: "c2", label: "Marcus Thorn", reason: "first_name" },
      ],
    });
  });

  it("marks ambiguous first-name matches", () => {
    const result = resolveSubject("Ava", null, chars, worlds);
    expect(result.resolution_status).toBe("ambiguous");
    expect(result.candidates.map((c) => c.label)).toEqual([
      "Ava Larent",
      "Ava Morgan",
    ]);
  });

  it("matches world element exact name", () => {
    expect(resolveSubject("The Hollow", null, chars, worlds)).toMatchObject({
      subject_character_id: null,
      subject_world_element_id: "w1",
      resolution_status: "resolved",
    });
  });

  it("returns nulls when unknown", () => {
    expect(resolveSubject("Nobody", null, chars, worlds)).toEqual({
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "unresolved",
      resolution_note: null,
      candidates: [],
    });
  });
});
