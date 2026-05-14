import { describe, expect, it } from "vitest";

import {
  clearRutasSnapshotCacheForTests,
  invalidateCachedRutasSnapshot,
  readCachedRutasSnapshot,
  writeCachedRutasSnapshot,
} from "@/lib/copilot-rutas-snapshot-cache";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";

const SNAPSHOT: CopilotRutasSnapshot = {
  generatedAt: "2026-05-14T12:00:00.000Z",
  feed: { items: [], groups: [], priorities: [] },
  timeline: [],
  memory: [],
  narratives: [],
  recommendations: [],
  counts: {
    feedItems: 0,
    groups: 0,
    memorySignals: 0,
    narratives: 0,
    recommendations: 0,
    timelineEvents: 0,
  },
  health: {
    status: "ok",
    warnings: [],
  },
};

describe("copilot-rutas-snapshot-cache", () => {
  it("guarda y lee snapshot por workspace", () => {
    clearRutasSnapshotCacheForTests();
    writeCachedRutasSnapshot("ws-1", SNAPSHOT, 1_000);
    expect(readCachedRutasSnapshot("ws-1", 1_000)).toEqual(SNAPSHOT);
    expect(readCachedRutasSnapshot("ws-2", 1_000)).toBeNull();
  });

  it("expira snapshot por TTL", () => {
    clearRutasSnapshotCacheForTests();
    writeCachedRutasSnapshot("ws-1", SNAPSHOT, 1_000);
    expect(readCachedRutasSnapshot("ws-1", 22_000)).toBeNull();
  });

  it("invalida snapshot del workspace", () => {
    clearRutasSnapshotCacheForTests();
    writeCachedRutasSnapshot("ws-1", SNAPSHOT, 1_000);
    invalidateCachedRutasSnapshot("ws-1");
    expect(readCachedRutasSnapshot("ws-1", 1_000)).toBeNull();
  });
});
