import { describe, expect, it } from "vitest";

import { invalidateOperationalRuntime } from "@/lib/copilot-operational-runtime";
import {
  clearRutasSnapshotCacheForTests,
  readCachedRutasSnapshot,
  writeCachedRutasSnapshot,
} from "@/lib/copilot-rutas-snapshot-cache";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";

function snapshotStub(): CopilotRutasSnapshot {
  return {
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
    health: { status: "ok", warnings: [] },
  };
}

describe("copilot-operational-runtime", () => {
  it("invalida el snapshot cache del workspace", () => {
    clearRutasSnapshotCacheForTests();
    const workspaceCompanyId = "ws-runtime";
    writeCachedRutasSnapshot(workspaceCompanyId, snapshotStub());
    expect(readCachedRutasSnapshot(workspaceCompanyId)).not.toBeNull();
    invalidateOperationalRuntime({ workspaceCompanyId, snapshot: true, reason: "test" });
    expect(readCachedRutasSnapshot(workspaceCompanyId)).toBeNull();
  });
});
