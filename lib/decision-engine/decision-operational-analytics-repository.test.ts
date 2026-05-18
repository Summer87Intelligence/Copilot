import { describe, expect, it } from "vitest";

import {
  isOperationalAnalyticsPayloadCurrent,
  isOperationalAnalyticsSnapshotFresh,
} from "@/lib/data/decision-operational-analytics-repository";
import type { OperationalAnalyticsSnapshot } from "@/lib/decision-engine/de-types";

const samplePayload: OperationalAnalyticsSnapshot = {
  generated_at: "2026-05-18T12:00:00.000Z",
  global: {
    active_cases: 1,
    unassigned_cases: 0,
    breached_sla_cases: 0,
    avg_time_to_first_action_hours: null,
    avg_resolution_time_hours: null,
    critical_open: 0,
    recovered_today: 0,
    followups_due_today: 0,
    operational_backlog: 1,
  },
  operators: [],
  sla: {
    compliance_pct: 100,
    breach_trend: [],
    operator_sla: [],
    breached_aging_buckets: { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 },
    breached_total: 0,
  },
  queue_signals: {
    sla_breached_count: 0,
    overloaded_operators_count: 0,
    followups_due_today: 0,
  },
};

describe("decision-operational-analytics-repository", () => {
  it("detecta payload analytics válido", () => {
    expect(isOperationalAnalyticsPayloadCurrent(samplePayload)).toBe(true);
    expect(isOperationalAnalyticsPayloadCurrent({})).toBe(false);
  });

  it("freshness por expires_at", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(
      isOperationalAnalyticsSnapshotFresh({
        id: "1",
        workspace_company_id: "t",
        generated_at: new Date().toISOString(),
        expires_at: future,
        payload: samplePayload,
        generation_ms: 10,
      })
    ).toBe(true);
    expect(
      isOperationalAnalyticsSnapshotFresh({
        id: "1",
        workspace_company_id: "t",
        generated_at: new Date().toISOString(),
        expires_at: past,
        payload: samplePayload,
        generation_ms: 10,
      })
    ).toBe(false);
  });
});
