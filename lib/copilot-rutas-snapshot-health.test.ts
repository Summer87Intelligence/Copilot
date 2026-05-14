import { describe, expect, it } from "vitest";

import {
  buildSnapshotHealth,
  createSnapshotWarning,
  deriveSnapshotHealthStatus,
} from "@/lib/copilot-rutas-snapshot-health";

describe("copilot-rutas-snapshot-health", () => {
  it("deriva ok, partial, degraded, stale y error", () => {
    expect(deriveSnapshotHealthStatus([], { feedAvailable: true })).toBe("ok");
    expect(
      deriveSnapshotHealthStatus(
        [createSnapshotWarning("memory", "TIMEOUT", "timeout")],
        { feedAvailable: true }
      )
    ).toBe("partial");
    expect(
      deriveSnapshotHealthStatus(
        [
          createSnapshotWarning("memory", "TIMEOUT", "timeout"),
          createSnapshotWarning("narrative", "ERROR", "error"),
        ],
        { feedAvailable: true }
      )
    ).toBe("degraded");
    expect(deriveSnapshotHealthStatus([], { feedAvailable: true, fromCache: true })).toBe(
      "stale"
    );
    expect(deriveSnapshotHealthStatus([], { feedAvailable: false })).toBe("error");
  });

  it("incluye timing y warnings en health", () => {
    const warning = createSnapshotWarning("timeline", "TIMEOUT", "timeout");
    const health = buildSnapshotHealth([warning], {
      feedAvailable: true,
      timingMs: { total: 10, feed: 4, timeline: 2 },
    });
    expect(health.status).toBe("partial");
    expect(health.warnings).toEqual([warning]);
    expect(health.timingMs?.total).toBe(10);
  });
});
