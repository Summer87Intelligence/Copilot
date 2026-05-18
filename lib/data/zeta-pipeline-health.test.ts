import { describe, it, expect } from "vitest";
import { derivePipelineHealth, PIPELINE_EXPECTED_INTERVALS_MS } from "./zeta-pipeline-health";
import { ZETA_PIPELINE_NAMES } from "./zeta-pipeline-run-types";
import type { ZetaPipelineRunRow } from "./zeta-pipeline-run-types";

const INTERVAL_3H = 3 * 60 * 60 * 1_000;
const NOW = new Date("2026-05-09T12:00:00Z").getTime();
const PIPELINE = "zeta-sync-saldos";

function makeRun(
  overrides: Partial<ZetaPipelineRunRow> & { started_at: string }
): ZetaPipelineRunRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    pipeline_name: PIPELINE,
    finished_at: null,
    duration_ms: null,
    status: "succeeded",
    rows_processed: 0,
    rows_updated: 0,
    rows_failed: 0,
    error_summary: null,
    metadata: null,
    ...overrides,
  };
}

// ── PIPELINE_EXPECTED_INTERVALS_MS ────────────────────────────────────────────

describe("PIPELINE_EXPECTED_INTERVALS_MS", () => {
  it("saldos tiene intervalo de 3 horas", () => {
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.SALDOS]).toBe(3 * 60 * 60 * 1_000);
  });

  it("vouchers tiene intervalo de 3 horas (Tier A)", () => {
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.VOUCHERS]).toBe(
      3 * 60 * 60 * 1_000
    );
  });

  it("cuotas tiene intervalo de 3 horas (Tier A)", () => {
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.CUOTAS]).toBe(
      3 * 60 * 60 * 1_000
    );
  });

  it("collection receipts tiene intervalo de 3 horas (Tier A)", () => {
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.COLLECTION_RECEIPTS]).toBe(
      3 * 60 * 60 * 1_000
    );
  });

  it("vendor payments tiene intervalo de 6 horas (Tier B)", () => {
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.VENDOR_PAYMENTS]).toBe(
      6 * 60 * 60 * 1_000
    );
  });

  it("completeness audit e integrity check tienen intervalo de 6 horas (Tier B)", () => {
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.COMPLETENESS_AUDIT]).toBe(
      6 * 60 * 60 * 1_000
    );
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.INTEGRITY_CHECK]).toBe(
      6 * 60 * 60 * 1_000
    );
  });

  it("contacts tiene intervalo de 24 horas (Tier C)", () => {
    expect(PIPELINE_EXPECTED_INTERVALS_MS[ZETA_PIPELINE_NAMES.CONTACTS]).toBe(
      24 * 60 * 60 * 1_000
    );
  });
});

// ── derivePipelineHealth — unknown ────────────────────────────────────────────

describe("derivePipelineHealth — sin runs", () => {
  it("devuelve status=unknown cuando no hay runs", () => {
    const result = derivePipelineHealth(PIPELINE, [], INTERVAL_3H, NOW);
    expect(result.status).toBe("unknown");
    expect(result.last_run_at).toBeNull();
    expect(result.last_success_at).toBeNull();
    expect(result.consecutive_failures).toBe(0);
    expect(result.is_overdue).toBe(false);
  });
});

// ── derivePipelineHealth — healthy ────────────────────────────────────────────

describe("derivePipelineHealth — healthy", () => {
  it("devuelve healthy cuando último run exitoso está dentro del intervalo", () => {
    // Último éxito hace 2 horas (menor a 3h)
    const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1_000).toISOString();
    const runs = [makeRun({ started_at: twoHoursAgo, status: "succeeded" })];

    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.status).toBe("healthy");
    expect(result.is_overdue).toBe(false);
    expect(result.consecutive_failures).toBe(0);
  });

  it("devuelve healthy con múltiples runs exitosos", () => {
    const oneHourAgo = new Date(NOW - 1 * 60 * 60 * 1_000).toISOString();
    const fourHoursAgo = new Date(NOW - 4 * 60 * 60 * 1_000).toISOString();
    const runs = [
      makeRun({ started_at: oneHourAgo, status: "succeeded" }),
      makeRun({ started_at: fourHoursAgo, status: "succeeded" }),
    ];

    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.status).toBe("healthy");
    expect(result.consecutive_failures).toBe(0);
  });
});

// ── derivePipelineHealth — degraded ──────────────────────────────────────────

describe("derivePipelineHealth — degraded", () => {
  it("devuelve degraded con 2+ fallos consecutivos antes de un éxito previo", () => {
    const thirtyMinAgo = new Date(NOW - 30 * 60 * 1_000).toISOString();
    const oneHourAgo = new Date(NOW - 60 * 60 * 1_000).toISOString();
    const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1_000).toISOString();

    const runs = [
      makeRun({ started_at: thirtyMinAgo, status: "failed" }),
      makeRun({ started_at: oneHourAgo, status: "partial" }),
      makeRun({ started_at: twoHoursAgo, status: "succeeded" }),
    ];

    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.status).toBe("degraded");
    expect(result.consecutive_failures).toBe(2);
  });

  it("expone el error_summary del run más reciente", () => {
    const recentFail = makeRun({
      started_at: new Date(NOW - 30 * 60 * 1_000).toISOString(),
      status: "failed",
      error_summary: "zeta_http: connection refused",
    });

    const result = derivePipelineHealth(PIPELINE, [recentFail], INTERVAL_3H, NOW);
    expect(result.last_error_summary).toBe("zeta_http: connection refused");
  });
});

// ── derivePipelineHealth — stalled ────────────────────────────────────────────

describe("derivePipelineHealth — stalled", () => {
  it("devuelve stalled cuando sin éxito por más de 2× el intervalo", () => {
    // Último éxito hace 7 horas (> 2 * 3h = 6h)
    const sevenHoursAgo = new Date(NOW - 7 * 60 * 60 * 1_000).toISOString();
    const runs = [makeRun({ started_at: sevenHoursAgo, status: "succeeded" })];

    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.status).toBe("stalled");
    expect(result.is_overdue).toBe(true);
  });

  it("devuelve stalled cuando nunca hubo éxito y hay runs fallidos", () => {
    const thirtyMinAgo = new Date(NOW - 30 * 60 * 1_000).toISOString();
    const runs = [makeRun({ started_at: thirtyMinAgo, status: "failed" })];

    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.is_overdue).toBe(true);
    // Un solo fallo → degraded (overdue con 1 fallo) o stalled (sin éxito nunca)
    // Según la lógica: sin last_success_at, msSinceSuccess = Infinity > 2 * interval
    expect(result.status).toBe("stalled");
  });
});

// ── derivePipelineHealth — is_overdue ─────────────────────────────────────────

describe("derivePipelineHealth — is_overdue", () => {
  it("is_overdue=false cuando último éxito está dentro del intervalo", () => {
    const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1_000).toISOString();
    const runs = [makeRun({ started_at: twoHoursAgo, status: "succeeded" })];
    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.is_overdue).toBe(false);
  });

  it("is_overdue=true cuando último éxito superó el intervalo", () => {
    const fourHoursAgo = new Date(NOW - 4 * 60 * 60 * 1_000).toISOString();
    const runs = [makeRun({ started_at: fourHoursAgo, status: "succeeded" })];
    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.is_overdue).toBe(true);
  });

  it("is_overdue=true cuando nunca hubo éxito", () => {
    const runs = [makeRun({ started_at: new Date(NOW - 1_000).toISOString(), status: "failed" })];
    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.is_overdue).toBe(true);
  });
});

// ── derivePipelineHealth — campos base ───────────────────────────────────────

describe("derivePipelineHealth — campos derivados", () => {
  it("last_run_at es el run más reciente", () => {
    const t1 = new Date(NOW - 1 * 60 * 60 * 1_000).toISOString();
    const t2 = new Date(NOW - 2 * 60 * 60 * 1_000).toISOString();
    const runs = [
      makeRun({ started_at: t2, status: "succeeded" }),
      makeRun({ started_at: t1, status: "succeeded" }),
    ];
    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.last_run_at).toBe(t1);
  });

  it("last_success_at es el run exitoso más reciente", () => {
    const failAt = new Date(NOW - 30 * 60 * 1_000).toISOString();
    const successAt = new Date(NOW - 90 * 60 * 1_000).toISOString();
    const runs = [
      makeRun({ started_at: failAt, status: "failed" }),
      makeRun({ started_at: successAt, status: "succeeded" }),
    ];
    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.last_success_at).toBe(successAt);
  });

  it("last_success_at=null cuando nunca hubo éxito", () => {
    const runs = [makeRun({ started_at: new Date(NOW - 1_000).toISOString(), status: "failed" })];
    const result = derivePipelineHealth(PIPELINE, runs, INTERVAL_3H, NOW);
    expect(result.last_success_at).toBeNull();
  });

  it("preserva pipeline_name y expected_interval_ms", () => {
    const result = derivePipelineHealth(PIPELINE, [], INTERVAL_3H, NOW);
    expect(result.pipeline_name).toBe(PIPELINE);
    expect(result.expected_interval_ms).toBe(INTERVAL_3H);
  });
});
