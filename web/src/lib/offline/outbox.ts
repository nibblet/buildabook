import { getDB, type OutboxItem } from "./db";
import { setMeta } from "./repo";

const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000];
const MAX_ATTEMPTS = BACKOFF_MS.length;

export type SaveSceneFn = (
  sceneId: string,
  html: string,
  wordcount: number,
) => Promise<unknown>;

export type DrainResult = {
  succeeded: number;
  failed: number;
  authError: boolean;
};

function isAuthError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /unauthorized|not authenticated|jwt|auth/i.test(msg);
}

/**
 * Per scene, keep only the row with the highest clientTs (last-write-wins).
 * Older rows are dropped — their content is superseded.
 */
async function collapseOutbox(): Promise<OutboxItem[]> {
  const db = getDB();
  const all = await db.outbox.orderBy("clientTs").toArray();
  const latestBySceneId = new Map<string, OutboxItem>();
  const stale: number[] = [];
  for (const row of all) {
    const prev = latestBySceneId.get(row.sceneId);
    if (!prev || row.clientTs > prev.clientTs) {
      if (prev?.id !== undefined) stale.push(prev.id);
      latestBySceneId.set(row.sceneId, row);
    } else if (row.id !== undefined) {
      stale.push(row.id);
    }
  }
  if (stale.length) await db.outbox.bulkDelete(stale);
  return [...latestBySceneId.values()];
}

export async function outboxHasPendingItems(): Promise<boolean> {
  const db = getDB();
  return (await db.outbox.count()) > 0;
}

export async function drainOutbox(
  saveScene: SaveSceneFn,
): Promise<DrainResult> {
  const db = getDB();
  const now = Date.now();
  const items = await collapseOutbox();
  let succeeded = 0;
  let failed = 0;
  let authError = false;

  for (const item of items) {
    if (item.nextRetryAt && item.nextRetryAt > now) continue;
    if (item.attempts >= MAX_ATTEMPTS) continue;
    try {
      await saveScene(item.sceneId, item.html, item.wordcount);
      if (item.id !== undefined) await db.outbox.delete(item.id);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      const auth = isAuthError(err);
      if (auth) authError = true;
      const attempts = item.attempts + 1;
      const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
      if (item.id !== undefined) {
        await db.outbox.update(item.id, {
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
          nextRetryAt: Date.now() + backoff,
        });
      }
      if (auth) break;
    }
  }

  if (succeeded > 0) await setMeta("lastSync", Date.now());
  return { succeeded, failed, authError };
}

export async function retryAllFailed(): Promise<void> {
  const db = getDB();
  await db.outbox.toCollection().modify((row) => {
    row.attempts = 0;
    row.nextRetryAt = undefined;
    row.lastError = undefined;
  });
}

export async function discardOutboxItem(id: number): Promise<void> {
  const db = getDB();
  await db.outbox.delete(id);
}
