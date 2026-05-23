import { getDB, type OutboxItem } from "./db";

type Entity =
  | "projects"
  | "chapters"
  | "scenes"
  | "characters"
  | "beats"
  | "world_elements"
  | "relationships"
  | "scene_revisions";

const ALL_TABLES: Entity[] = [
  "projects",
  "chapters",
  "scenes",
  "characters",
  "beats",
  "world_elements",
  "relationships",
  "scene_revisions",
];

export async function bulkPutEntities(
  payload: Partial<Record<Entity, unknown[]>>,
): Promise<void> {
  const db = getDB();
  const tables = ALL_TABLES.filter((t) => Array.isArray(payload[t]));
  if (tables.length === 0) return;
  await db.transaction(
    "rw",
    tables.map((t) => db.table(t)),
    async () => {
      for (const t of tables) {
        const rows = (payload[t] ?? []).filter(
          (r): r is Record<string, unknown> & { id: string } =>
            !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string",
        );
        if (rows.length > 0) await db.table(t).bulkPut(rows);
      }
    },
  );
}

export async function cacheSceneSnapshot(scene: {
  id: string;
  content: string;
  wordcount: number;
  [k: string]: unknown;
}): Promise<void> {
  const db = getDB();
  const existing = (await db.scenes.get(scene.id)) ?? {};
  await db.scenes.put({ ...existing, ...scene });
}

export async function enqueueSceneSave(
  item: Omit<OutboxItem, "id" | "attempts">,
): Promise<number> {
  const db = getDB();
  return db.outbox.add({ ...item, attempts: 0 });
}

export async function clearOutboxUpTo(
  sceneId: string,
  clientTs: number,
): Promise<void> {
  const db = getDB();
  await db.outbox
    .where("sceneId")
    .equals(sceneId)
    .and((row) => row.clientTs <= clientTs)
    .delete();
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = getDB();
  await db.meta.put({ key, value });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = getDB();
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}
