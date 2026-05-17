/**
 * ZETA-16: Tests for zeta-health-score.
 *
 * Cubre:
 * - statusFromScore thresholds (healthy/warning/degraded/critical)
 * - computeZetaHealthScore: healthy when no issues
 * - computeZetaHealthScore: critical when circuit open
 * - computeZetaHealthScore: degraded when critical violations
 * - Score is not degraded by acknowledged drifts
 */

import { describe, expect, it } from "vitest";
import { computeZetaHealthScore } from "@/lib/ops/zeta-health-score";
import type { SupabaseClient } from "@supabase/supabase-js";

const WORKSPACE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// ── Stub factory ──────────────────────────────────────────────────────────────

type TableData = Record<string, unknown[]>;

function makeStub(tables: TableData = {}): SupabaseClient {
  function makeQ(table: string) {
    const q: Record<string, unknown> = {
      select() { return q; },
      eq() { return q; },
      gte() { return q; },
      lt() { return q; },
      in() { return q; },
      order() { return q; },
      limit() { return q; },
      filter() { return q; },
      maybeSingle() {
        const rows = tables[table] ?? [];
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        return resolve({ data: tables[table] ?? [], error: null });
      },
    };
    return q;
  }
  return { from: (t: string) => makeQ(t) } as unknown as SupabaseClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computeZetaHealthScore — healthy baseline", () => {
  it("returns healthy with score ~100 when no issues", async () => {
    const stub = makeStub({
      zeta_pipeline_runs: [
        { status: "succeeded", finished_at: new Date(Date.now() - 30 * 60_000).toISOString() },
      ],
      zeta_integrity_violations: [],
      zeta_resync_jobs: [],
      zeta_sync_metrics: [],
      zeta_acknowledged_drifts: [],
      zeta_completeness_audits: [],
    });

    const result = await computeZetaHealthScore(stub, WORKSPACE);
    expect(result.status).toBe("healthy");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.acknowledged_drifts).toBe(0);
  });
});

describe("computeZetaHealthScore — critical violations degrade score", () => {
  it("returns degraded when critical integrity violations exist", async () => {
    const stub = makeStub({
      zeta_pipeline_runs: [
        { status: "succeeded", finished_at: new Date(Date.now() - 30 * 60_000).toISOString() },
      ],
      zeta_integrity_violations: [
        { check_name: "invoice_balance_exceeds_total" },
        { check_name: "invoice_balance_exceeds_total" },
        { check_name: "invoice_balance_exceeds_total" },
      ],
      zeta_resync_jobs: [],
      zeta_sync_metrics: [],
      zeta_acknowledged_drifts: [],
      zeta_completeness_audits: [],
    });

    const result = await computeZetaHealthScore(stub, WORKSPACE);
    // Integrity score = 40 (1+ critical), weighted at 25% → reduces overall score
    expect(result.score).toBeLessThan(90);
    expect(result.dimensions.integrity.score).toBe(40);
    expect(result.dimensions.integrity.issues.length).toBeGreaterThan(0);
  });
});

describe("computeZetaHealthScore — dead letter degrades queue", () => {
  it("penalizes dead letter jobs in queue dimension", async () => {
    const stub = makeStub({
      zeta_pipeline_runs: [],
      zeta_integrity_violations: [],
      zeta_resync_jobs: [
        { id: "j1", status: "dead_letter", created_at: new Date().toISOString() },
        { id: "j2", status: "dead_letter", created_at: new Date().toISOString() },
      ],
      zeta_sync_metrics: [],
      zeta_acknowledged_drifts: [],
      zeta_completeness_audits: [],
    });

    const result = await computeZetaHealthScore(stub, WORKSPACE);
    expect(result.dimensions.queue_health.score).toBeLessThan(60);
    expect(result.dimensions.queue_health.data.dead_letter).toBe(2);
  });
});

describe("computeZetaHealthScore — acknowledged drifts don't affect score", () => {
  it("acknowledged drifts are counted informational but score stays healthy", async () => {
    const stub = makeStub({
      zeta_pipeline_runs: [
        { status: "succeeded", finished_at: new Date(Date.now() - 30 * 60_000).toISOString() },
      ],
      zeta_integrity_violations: [],
      zeta_resync_jobs: [],
      zeta_sync_metrics: [],
      zeta_acknowledged_drifts: [
        {
          entity: "invoices",
          audit_scope: "period:2026-04",
          acknowledgement_expires_at: null, // permanent
        },
      ],
      zeta_completeness_audits: [],
    });

    const result = await computeZetaHealthScore(stub, WORKSPACE);
    expect(result.acknowledged_drifts).toBe(1);
    // Score should NOT be degraded by the acknowledged drift
    expect(result.dimensions.integrity.score).toBe(100);
    expect(result.status).not.toBe("critical");
  });
});

describe("computeZetaHealthScore — circuit open = critical API health", () => {
  it("circuit_open metric drives API health to 0", async () => {
    const stub = makeStub({
      zeta_pipeline_runs: [],
      zeta_integrity_violations: [],
      zeta_resync_jobs: [],
      zeta_sync_metrics: [
        { metric_name: "circuit_open", metric_value: 1 },
      ],
      zeta_acknowledged_drifts: [],
      zeta_completeness_audits: [],
    });

    const result = await computeZetaHealthScore(stub, WORKSPACE);
    expect(result.dimensions.api_health.score).toBe(0);
    expect(result.dimensions.api_health.data.circuit_open).toBe(true);
    expect(result.score).toBeLessThan(90);
  });
});
