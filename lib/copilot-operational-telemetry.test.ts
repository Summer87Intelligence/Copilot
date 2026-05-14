import { describe, it, expect, beforeEach } from "vitest";
import {
  clearTelemetryForTests,
  getAllTrackedWorkspaces,
  getRebuildHealthSummary,
  getWorkspaceRebuildMetrics,
  recordRebuildMetric,
  withRebuildTiming,
} from "./copilot-operational-telemetry";

const WS_A = "ws-aaa";
const WS_B = "ws-bbb";

function makeMetric(
  workspaceCompanyId: string,
  overrides: Partial<Parameters<typeof recordRebuildMetric>[0]> = {}
) {
  return {
    workspaceCompanyId,
    durationMs: 100,
    workflowCount: 3,
    emittedEventCount: 1,
    automationCount: 2,
    degraded: false,
    rebuildReason: "test",
    phase: "full" as const,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  clearTelemetryForTests();
});

describe("recordRebuildMetric", () => {
  it("stores metric for workspace", () => {
    recordRebuildMetric(makeMetric(WS_A));
    expect(getWorkspaceRebuildMetrics(WS_A)).toHaveLength(1);
  });

  it("keeps metrics for different workspaces isolated", () => {
    recordRebuildMetric(makeMetric(WS_A));
    recordRebuildMetric(makeMetric(WS_B));
    recordRebuildMetric(makeMetric(WS_B));
    expect(getWorkspaceRebuildMetrics(WS_A)).toHaveLength(1);
    expect(getWorkspaceRebuildMetrics(WS_B)).toHaveLength(2);
  });

  it("ring buffer caps at 50 entries", () => {
    for (let i = 0; i < 60; i++) {
      recordRebuildMetric(makeMetric(WS_A, { durationMs: i + 1 }));
    }
    const metrics = getWorkspaceRebuildMetrics(WS_A);
    expect(metrics).toHaveLength(50);
    // should keep the most recent 50 (entries 11-60, durationMs 11-60)
    expect(metrics[0]!.durationMs).toBe(11);
    expect(metrics[49]!.durationMs).toBe(60);
  });

  it("exactly 50 entries does not trim", () => {
    for (let i = 0; i < 50; i++) {
      recordRebuildMetric(makeMetric(WS_A));
    }
    expect(getWorkspaceRebuildMetrics(WS_A)).toHaveLength(50);
  });
});

describe("getRebuildHealthSummary", () => {
  it("returns zero summary for unknown workspace", () => {
    const summary = getRebuildHealthSummary("unknown-ws");
    expect(summary.rebuildCount).toBe(0);
    expect(summary.avgDurationMs).toBe(0);
    expect(summary.lastTimestamp).toBeNull();
  });

  it("computes average duration correctly", () => {
    recordRebuildMetric(makeMetric(WS_A, { durationMs: 100 }));
    recordRebuildMetric(makeMetric(WS_A, { durationMs: 200 }));
    recordRebuildMetric(makeMetric(WS_A, { durationMs: 300 }));
    const summary = getRebuildHealthSummary(WS_A);
    expect(summary.avgDurationMs).toBe(200);
    expect(summary.lastDurationMs).toBe(300);
    expect(summary.rebuildCount).toBe(3);
  });

  it("counts degraded entries", () => {
    recordRebuildMetric(makeMetric(WS_A, { degraded: true }));
    recordRebuildMetric(makeMetric(WS_A, { degraded: false }));
    recordRebuildMetric(makeMetric(WS_A, { degraded: true }));
    const summary = getRebuildHealthSummary(WS_A);
    expect(summary.degradedCount).toBe(2);
  });

  it("returns last workflow and automation counts from most recent metric", () => {
    recordRebuildMetric(makeMetric(WS_A, { workflowCount: 5, automationCount: 3 }));
    recordRebuildMetric(makeMetric(WS_A, { workflowCount: 7, automationCount: 4 }));
    const summary = getRebuildHealthSummary(WS_A);
    expect(summary.lastWorkflowCount).toBe(7);
    expect(summary.lastAutomationCount).toBe(4);
  });

  it("rounds average duration to nearest integer", () => {
    recordRebuildMetric(makeMetric(WS_A, { durationMs: 100 }));
    recordRebuildMetric(makeMetric(WS_A, { durationMs: 101 }));
    const summary = getRebuildHealthSummary(WS_A);
    // (100 + 101) / 2 = 100.5 → rounds to 101
    expect(summary.avgDurationMs).toBe(101);
  });
});

describe("getAllTrackedWorkspaces", () => {
  it("returns empty array when no metrics recorded", () => {
    expect(getAllTrackedWorkspaces()).toHaveLength(0);
  });

  it("returns all workspaces with at least one metric", () => {
    recordRebuildMetric(makeMetric(WS_A));
    recordRebuildMetric(makeMetric(WS_B));
    const workspaces = getAllTrackedWorkspaces();
    expect(workspaces).toContain(WS_A);
    expect(workspaces).toContain(WS_B);
    expect(workspaces).toHaveLength(2);
  });
});

describe("clearTelemetryForTests", () => {
  it("removes all recorded metrics", () => {
    recordRebuildMetric(makeMetric(WS_A));
    recordRebuildMetric(makeMetric(WS_B));
    clearTelemetryForTests();
    expect(getAllTrackedWorkspaces()).toHaveLength(0);
    expect(getWorkspaceRebuildMetrics(WS_A)).toHaveLength(0);
  });
});

describe("withRebuildTiming", () => {
  it("records a metric after operation resolves", async () => {
    await withRebuildTiming(WS_A, "full", "test:timing", async () => ({
      workflowCount: 4,
      emittedEventCount: 2,
      automationCount: 1,
      degraded: false,
    }));
    const metrics = getWorkspaceRebuildMetrics(WS_A);
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.workflowCount).toBe(4);
    expect(metrics[0]!.phase).toBe("full");
    expect(metrics[0]!.rebuildReason).toBe("test:timing");
  });

  it("returns the operation result", async () => {
    const result = await withRebuildTiming(WS_A, "lightweight", "reason", async () => ({
      workflowCount: 2,
      payload: "data",
    }));
    expect((result as { payload: string }).payload).toBe("data");
  });

  it("defaults missing fields to 0/false", async () => {
    await withRebuildTiming(WS_A, "full", "minimal", async () => ({}));
    const m = getWorkspaceRebuildMetrics(WS_A)[0]!;
    expect(m.workflowCount).toBe(0);
    expect(m.emittedEventCount).toBe(0);
    expect(m.automationCount).toBe(0);
    expect(m.degraded).toBe(false);
  });

  it("measures a non-zero duration", async () => {
    await withRebuildTiming(WS_A, "full", "timing-check", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {};
    });
    const m = getWorkspaceRebuildMetrics(WS_A)[0]!;
    expect(m.durationMs).toBeGreaterThan(0);
  });
});
