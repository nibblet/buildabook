import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  optionalUuidArraySchema,
  optionalUuidSchema,
  preprocessOptionalUuidArray,
} from "@/lib/ai/flow-zod-helpers";

const SAMPLE =
  "550e8400-e29b-41d4-a716-446655440000" as const;

describe("flow-zod-helpers", () => {
  it("drops non-uuid strings from optionalUuidArraySchema", () => {
    const Schema = z.object({ ids: optionalUuidArraySchema });
    const r = Schema.parse({
      ids: ["not-a-uuid", SAMPLE, "scene_12", ` ${SAMPLE} `],
    });
    expect(r.ids).toEqual([SAMPLE, SAMPLE]);
  });

  it("preprocessOptionalUuidArray returns undefined when all invalid", () => {
    expect(preprocessOptionalUuidArray(["foo", "bar"])).toBeUndefined();
  });

  it("optionalUuidSchema rejects invalid single ids", () => {
    const Schema = z.object({ id: optionalUuidSchema });
    expect(Schema.parse({ id: "broken" })).toEqual({});
    expect(Schema.parse({ id: SAMPLE })).toEqual({ id: SAMPLE });
  });
});
