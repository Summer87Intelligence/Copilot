import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";

const RUTAS_SNAPSHOT_CACHE_TTL_MS = 20_000;

type CacheEntry = {
  cachedAt: number;
  snapshot: CopilotRutasSnapshot;
};

const cacheByWorkspace = new Map<string, CacheEntry>();

export function getRutasSnapshotCacheKey(workspaceCompanyId: string): string {
  return `copilot:rutas-snapshot:${workspaceCompanyId}`;
}

export function readCachedRutasSnapshot(
  workspaceCompanyId: string,
  now = Date.now()
): CopilotRutasSnapshot | null {
  const entry = cacheByWorkspace.get(getRutasSnapshotCacheKey(workspaceCompanyId));
  if (!entry) return null;
  if (now - entry.cachedAt > RUTAS_SNAPSHOT_CACHE_TTL_MS) {
    cacheByWorkspace.delete(getRutasSnapshotCacheKey(workspaceCompanyId));
    return null;
  }
  return entry.snapshot;
}

export function writeCachedRutasSnapshot(
  workspaceCompanyId: string,
  snapshot: CopilotRutasSnapshot,
  now = Date.now()
): void {
  cacheByWorkspace.set(getRutasSnapshotCacheKey(workspaceCompanyId), {
    cachedAt: now,
    snapshot,
  });
}

export function invalidateCachedRutasSnapshot(workspaceCompanyId: string): void {
  cacheByWorkspace.delete(getRutasSnapshotCacheKey(workspaceCompanyId));
}

export function clearRutasSnapshotCacheForTests(): void {
  cacheByWorkspace.clear();
}

export const RUTAS_SNAPSHOT_CACHE_TTL_MS_EXPORT = RUTAS_SNAPSHOT_CACHE_TTL_MS;
