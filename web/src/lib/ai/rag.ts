/**
 * Retired in favor of compiled wiki context (see web/src/lib/wiki/).
 * Retained as a no-op so any stale imports keep compiling while we migrate.
 * Remove once grep confirms no remaining callers.
 */
export async function retrieveRagContinuity(_args: {
  projectId: string;
  excludeSceneId: string | null;
  queryText: string;
  limit?: number;
}): Promise<string | null> {
  return null;
}
