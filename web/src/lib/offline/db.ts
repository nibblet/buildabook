import Dexie, { type Table } from "dexie";

export interface OutboxItem {
  id?: number;
  sceneId: string;
  html: string;
  wordcount: number;
  fingerprint: string;
  clientTs: number;
  attempts: number;
  lastError?: string;
  nextRetryAt?: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

type AnyRow = Record<string, unknown> & { id: string };

export class WriteOfflineDB extends Dexie {
  projects!: Table<AnyRow, string>;
  chapters!: Table<AnyRow, string>;
  scenes!: Table<AnyRow, string>;
  characters!: Table<AnyRow, string>;
  beats!: Table<AnyRow, string>;
  world_elements!: Table<AnyRow, string>;
  relationships!: Table<AnyRow, string>;
  scene_revisions!: Table<AnyRow, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("write-offline");
    this.version(1).stores({
      projects: "id",
      chapters: "id, project_id, order_index",
      scenes: "id, chapter_id, project_id, order_index",
      characters: "id, project_id",
      beats: "id, project_id",
      world_elements: "id, project_id",
      relationships: "id, project_id",
      scene_revisions: "id, scene_id, created_at",
      outbox: "++id, sceneId, clientTs",
      meta: "key",
    });
  }
}

let _db: WriteOfflineDB | null = null;

export function getDB(): WriteOfflineDB {
  if (typeof window === "undefined") {
    throw new Error("Offline DB is browser-only.");
  }
  if (!_db) _db = new WriteOfflineDB();
  return _db;
}
