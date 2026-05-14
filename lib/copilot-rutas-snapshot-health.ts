import type {
  CopilotRutasSnapshotCounts,
  SnapshotHealth,
  SnapshotHealthStatus,
  SnapshotHealthWarning,
} from "@/lib/copilot-rutas-snapshot-types";

export function createSnapshotWarning(
  source: string,
  code: string,
  message: string
): SnapshotHealthWarning {
  return { source, code, message };
}

export function deriveSnapshotHealthStatus(
  warnings: SnapshotHealthWarning[],
  options: { feedAvailable: boolean; fromCache?: boolean }
): SnapshotHealthStatus {
  if (options.fromCache) return "stale";
  if (!options.feedAvailable) return "error";
  if (warnings.length === 0) return "ok";
  if (warnings.length === 1) return "partial";
  return "degraded";
}

export function buildSnapshotHealth(
  warnings: SnapshotHealthWarning[],
  options: {
    feedAvailable: boolean;
    fromCache?: boolean;
    timingMs?: SnapshotHealth["timingMs"];
  }
): SnapshotHealth {
  return {
    status: deriveSnapshotHealthStatus(warnings, options),
    warnings,
    timingMs: options.timingMs,
  };
}

export function logSnapshotObservability(input: {
  health: SnapshotHealth;
  counts: CopilotRutasSnapshotCounts;
  cacheHit?: boolean;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[copilot-rutas-snapshot]", {
    totalMs: input.health.timingMs?.total,
    feedMs: input.health.timingMs?.feed,
    memoryMs: input.health.timingMs?.memory,
    narrativeMs: input.health.timingMs?.narrative,
    recommendationsMs: input.health.timingMs?.recommendations,
    timelineMs: input.health.timingMs?.timeline,
    status: input.health.status,
    warnings: input.health.warnings.length,
    counts: input.counts,
    cacheHit: input.cacheHit ?? false,
  });
}
