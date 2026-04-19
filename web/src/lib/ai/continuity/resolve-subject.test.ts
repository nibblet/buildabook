import { describe, expect, it } from "vitest";
import { resolveSubject } from "./resolve-subject";

describe("resolveSubject", () => {
  const chars = [
    { id: "c1", name: "Elena", aliases: ["El"] },
    { id: "c2", name: "Marcus", aliases: [] },
  ];
  const worlds = [{ id: "w1", name: "The Hollow", aliases: ["Hollow"] }];

  it("matches UUID hint on character", () => {
    expect(resolveSubject("x", "c1", chars, worlds)).toEqual({
      subject_character_id: "c1",
      subject_world_element_id: null,
    });
  });

  it("matches exact name", () => {
    expect(resolveSubject("Marcus", null, chars, worlds)).toEqual({
      subject_character_id: "c2",
      subject_world_element_id: null,
    });
  });

  it("matches alias", () => {
    expect(resolveSubject("El", null, chars, worlds)).toEqual({
      subject_character_id: "c1",
      subject_world_element_id: null,
    });
  });

  it("matches world element", () => {
    expect(resolveSubject("The Hollow", null, chars, worlds)).toEqual({
      subject_character_id: null,
      subject_world_element_id: "w1",
    });
  });

  it("returns nulls when unknown", () => {
    expect(resolveSubject("Nobody", null, chars, worlds)).toEqual({
      subject_character_id: null,
      subject_world_element_id: null,
    });
  });
});
