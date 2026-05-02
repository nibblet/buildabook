import { z } from "zod";

const UUID = z.string().uuid();

/** Models sometimes emit labels, partial ids, or placeholders — keep only valid UUIDs. */
export function preprocessOptionalUuidArray(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (UUID.safeParse(t).success) out.push(t);
  }
  return out.length > 0 ? out : undefined;
}

export function preprocessOptionalUuid(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return UUID.safeParse(t).success ? t : undefined;
}

/** Optional array of scene/entity UUIDs from model JSON. */
export const optionalUuidArraySchema = z.preprocess(
  preprocessOptionalUuidArray,
  z.array(z.string().uuid()).optional(),
);

/** Optional single UUID field from model JSON. */
export const optionalUuidSchema = z.preprocess(
  preprocessOptionalUuid,
  z.string().uuid().optional(),
);
