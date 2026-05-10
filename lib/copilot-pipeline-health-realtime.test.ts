import { describe, it, expect } from "vitest";
import {
  derivePipelineAlerts,
  getPollingIntervalMs,
} from "./copilot-pipeline-health-realtime";
import type { PipelineHealthSummary } from "@/lib/data/zeta-pipeline-health";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSummary(
  overrides: Partial<PipelineHealthSummary> & { pipeline_name: string }
): PipelineHealthSummary {
  return {
    status: "healthy",
    last_run_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    consecutive_failures: 0,
    last_error_summary: null,
    expected_interval_ms: 3 * 60 * 60 * 1_000,
    is_overdue: false,
    last_run_duration_ms: null,
    last_run_rows_processed: 100,
    last_run_rows_updated: 100,
    last_run_rows_failed: 0,
    ...overrides,
  };
}

// ── getPollingIntervalMs ──────────────────────────────────────────────────────

describe("getPollingIntervalMs", () => {
  it("returns 60s when realtime is connected (safety-net polling)", () => {
    expect(getPollingIntervalMs("connected")).toBe(60_000);
  });

  it("returns 15s when realtime is degraded (fallback polling)", () => {
    expect(getPollingIntervalMs("degraded")).toBe(15_000);
  });

  it("returns 15s when realtime is disconnected", () => {
    expect(getPollingIntervalMs("disconnected")).toBe(15_000);
  });

  it("returns 15s while connecting (not yet confirmed)", () => {
    expect(getPollingIntervalMs("connecting")).toBe(15_000);
  });
});

// ── derivePipelineAlerts — no alerts when healthy ─────────────────────────────

describe("derivePipelineAlerts — todos healthy", () => {
  it("returns empty array when all pipelines are healthy", () => {
    const summaries = [
      makeSummary({ pipeline_name: "zeta-sync-saldos" }),
      makeSummary({ pipeline_name: "zeta-sync-vouchers" }),
      makeSummary({ pipeline_name: "zeta-sync-contacts" }),
    ];
    expect(derivePipelineAlerts(summaries)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(derivePipelineAlerts([])).toHaveLength(0);
  });
});

// ── derivePipelineAlerts — stale ──────────────────────────────────────────────

describe("derivePipelineAlerts — stale pipeline", () => {
  it("includes stale alert when pipeline is overdue and has a prior run", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      is_overdue: true,
      last_run_at: new Date(Date.now() - 4 * 60 * 60 * 1_000).toISOString(),
    });
    const alerts = derivePipelineAlerts([s]);
    expect(alerts.some((a) => a.kind === "stale")).toBe(true);
    expect(alerts.find((a) => a.kind === "stale")?.pipeline_name).toBe("zeta-sync-saldos");
  });

  it("does NOT produce stale alert when overdue but last_run_at is null (never ran)", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      is_overdue: true,
      last_run_at: null,
    });
    const alerts = derivePipelineAlerts([s]);
    expect(alerts.some((a) => a.kind === "stale")).toBe(false);
  });

  it("does NOT produce stale alert when not overdue", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      is_overdue: false,
    });
    const alerts = derivePipelineAlerts([s]);
    expect(alerts.some((a) => a.kind === "stale")).toBe(false);
  });
});

// ── derivePipelineAlerts — consecutive_failures ───────────────────────────────

describe("derivePipelineAlerts — consecutive_failures", () => {
  it("includes consecutive_failures alert when > 0", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-vouchers",
      consecutive_failures: 2,
    });
    const alerts = derivePipelineAlerts([s]);
    const alert = alerts.find((a) => a.kind === "consecutive_failures");
    expect(alert).toBeDefined();
    expect(alert?.pipeline_name).toBe("zeta-sync-vouchers");
    expect(alert?.message).toContain("2");
  });

  it("singular message when consecutive_failures === 1", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      consecutive_failures: 1,
    });
    const alerts = derivePipelineAlerts([s]);
    const alert = alerts.find((a) => a.kind === "consecutive_failures");
    expect(alert?.message).toContain("1 fallo consecutivo");
  });

  it("plural message when consecutive_failures > 1", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      consecutive_failures: 3,
    });
    const alert = derivePipelineAlerts([s]).find(
      (a) => a.kind === "consecutive_failures"
    );
    expect(alert?.message).toContain("3 fallos consecutivos");
  });

  it("does NOT include consecutive_failures alert when = 0", () => {
    const s = makeSummary({ pipeline_name: "zeta-sync-saldos", consecutive_failures: 0 });
    expect(derivePipelineAlerts([s]).some((a) => a.kind === "consecutive_failures")).toBe(false);
  });
});

// ── derivePipelineAlerts — rows_failed ────────────────────────────────────────

describe("derivePipelineAlerts — rows_failed", () => {
  it("includes rows_failed alert when last_run_rows_failed > 0", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-contacts",
      last_run_rows_failed: 5,
    });
    const alerts = derivePipelineAlerts([s]);
    const alert = alerts.find((a) => a.kind === "rows_failed");
    expect(alert).toBeDefined();
    expect(alert?.message).toContain("5");
  });

  it("does NOT include rows_failed alert when last_run_rows_failed === 0", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      last_run_rows_failed: 0,
    });
    expect(derivePipelineAlerts([s]).some((a) => a.kind === "rows_failed")).toBe(false);
  });

  it("does NOT include rows_failed alert when last_run_rows_failed is null", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      last_run_rows_failed: null,
    });
    expect(derivePipelineAlerts([s]).some((a) => a.kind === "rows_failed")).toBe(false);
  });
});

// ── derivePipelineAlerts — error ──────────────────────────────────────────────

describe("derivePipelineAlerts — error_summary", () => {
  it("includes error alert when last_error_summary is present", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      last_error_summary: "zeta_http: connection refused",
    });
    const alerts = derivePipelineAlerts([s]);
    const alert = alerts.find((a) => a.kind === "error");
    expect(alert?.message).toBe("zeta_http: connection refused");
  });

  it("does NOT include error alert when last_error_summary is null", () => {
    const s = makeSummary({ pipeline_name: "zeta-sync-saldos", last_error_summary: null });
    expect(derivePipelineAlerts([s]).some((a) => a.kind === "error")).toBe(false);
  });
});

// ── derivePipelineAlerts — multiple pipelines, multiple issues ─────────────────

describe("derivePipelineAlerts — múltiples pipelines", () => {
  it("aggregates alerts from multiple pipelines", () => {
    const summaries = [
      makeSummary({
        pipeline_name: "zeta-sync-saldos",
        consecutive_failures: 2,
        is_overdue: true,
        last_run_at: new Date().toISOString(),
      }),
      makeSummary({ pipeline_name: "zeta-sync-vouchers" }), // healthy
      makeSummary({
        pipeline_name: "zeta-sync-contacts",
        last_run_rows_failed: 1,
      }),
    ];

    const alerts = derivePipelineAlerts(summaries);

    expect(alerts.some((a) => a.pipeline_name === "zeta-sync-saldos" && a.kind === "stale")).toBe(true);
    expect(alerts.some((a) => a.pipeline_name === "zeta-sync-saldos" && a.kind === "consecutive_failures")).toBe(true);
    expect(alerts.every((a) => a.pipeline_name !== "zeta-sync-vouchers")).toBe(true);
    expect(alerts.some((a) => a.pipeline_name === "zeta-sync-contacts" && a.kind === "rows_failed")).toBe(true);
  });

  it("a pipeline can produce multiple alerts simultaneously", () => {
    const s = makeSummary({
      pipeline_name: "zeta-sync-saldos",
      consecutive_failures: 1,
      last_run_rows_failed: 3,
      last_error_summary: "timeout",
      is_overdue: true,
      last_run_at: new Date().toISOString(),
    });
    const alerts = derivePipelineAlerts([s]);
    expect(alerts.filter((a) => a.pipeline_name === "zeta-sync-saldos")).toHaveLength(4);
  });
});
