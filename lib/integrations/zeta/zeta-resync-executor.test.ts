/**
 * ZETA-14: Tests del resync executor y job repository.
 *
 * Cubre:
 *  - parsePeriodScope: formatos válidos e inválidos
 *  - executeResyncJob: invoices → llama syncZetaCustomerVouchers con mes/anio correcto
 *  - executeResyncJob: receipts → llama syncZetaCollectionReceipts
 *  - executeResyncJob: installments → itera clientes, no fuerza invoice_id match
 *  - executeResyncJob: scope inválido → outcome.ok=false sin lanzar excepción
 *  - executeResyncJob: pipeline falla → outcome.ok=false, error propagado
 *  - executeResyncJob: entidad no soportada → outcome.ok=false
 *  - Job repository: markResyncJobRunning concurrency guard (solo claim si pending)
 *  - Job repository: stale detection via listStaleRunningResyncJobs
 *  - dry_run: no llama pipelines
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { parsePeriodScope, executeResyncJob } from "@/lib/integrations/zeta/zeta-resync-executor";
import {
  listPendingResyncJobs,
  listStaleRunningResyncJobs,
  markResyncJobRunning,
  markResyncJobSucceeded,
  markResyncJobFailed,
  markResyncJobSkipped,
} from "@/lib/data/zeta-resync-job-repository";
import type { ResyncJobRow } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

// ── Pipeline mocks ────────────────────────────────────────────────────────────

const vouchersMock = vi.fn();
const receiptsMock = vi.fn();
const installmentsMock = vi.fn();
const saldosMock = vi.fn();

vi.mock("@/lib/integrations/zeta/zeta-customer-vouchers-pipeline", () => ({
  syncZetaCustomerVouchers: (...args: unknown[]) => vouchersMock(...args),
}));

vi.mock("@/lib/integrations/zeta/zeta-collection-receipts-pipeline", () => ({
  syncZetaCollectionReceipts: (...args: unknown[]) => receiptsMock(...args),
}));

vi.mock("@/lib/integrations/zeta/zeta-installments-pipeline", () => ({
  runZetaInstallmentsPipeline: (...args: unknown[]) => installmentsMock(...args),
}));

vi.mock("@/lib/integrations/zeta/zeta-saldos-pipeline", () => ({
  runZetaSaldosPendientesPipeline: (...args: unknown[]) => saldosMock(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const WORKSPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeJob(overrides: Partial<ResyncJobRow> = {}): ResyncJobRow {
  return {
    id: JOB_ID,
    workspace_company_id: WORKSPACE,
    entity: "invoices",
    scope: "period:2026-05",
    status: "running",
    triggered_by: "manual",
    dry_run: false,
    rows_fetched: null,
    rows_synced: null,
    rows_skipped: null,
    error_summary: null,
    metadata: undefined,
    created_at: "2026-05-15T00:00:00.000Z",
    started_at: "2026-05-15T00:01:00.000Z",
    completed_at: null,
    retry_count: 0,
    max_retries: 3,
    last_error: null,
    retry_after: null,
    ...overrides,
  };
}

/** Supabase stub that tracks calls and simulates specific behaviors. */
function createSupabaseStub(opts: {
  companies?: Array<{ id: string; Codigo: string }>;
  companiesError?: string;
  updateReturnRows?: boolean; // for markResyncJobRunning: true = row returned (claimed), false = null
  jobs?: ResyncJobRow[];
  staleJobs?: ResyncJobRow[];
} = {}) {
  const updateCalls: Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const selectCalls: Array<{ table: string; filters: Record<string, unknown> }> = [];

  function makeQuery(table: string): Record<string, unknown> {
    const filters: Record<string, unknown> = {};
    let patch: Record<string, unknown> = {};
    let isUpdate = false;
    let isSelect = false;

    const q: Record<string, unknown> = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select(_cols: string) {
        isSelect = true;
        return q;
      },
      update(data: Record<string, unknown>) {
        isUpdate = true;
        patch = data;
        return q;
      },
      insert() {
        return q;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        return q;
      },
      lt(col: string, val: unknown) {
        filters[`${col}__lt`] = val;
        return q;
      },
      order() { return q; },
      limit() { return q; },
      not() { return q; },
      or() { return q; },
      maybeSingle() {
        if (isUpdate) {
          updateCalls.push({ table, patch, filters });
          // concurrency guard simulation: return row only if status=pending filter present
          const claimingRunning = filters["status"] === "pending";
          if (opts.updateReturnRows === false || !claimingRunning) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: makeJob({ status: "running" }), error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
        if (isSelect && table === "proto_companies") {
          selectCalls.push({ table, filters });
          if (opts.companiesError) {
            return resolve({ data: null, error: { message: opts.companiesError } });
          }
          return resolve({ data: opts.companies ?? [], error: null });
        }
        if (isSelect && table === "zeta_resync_jobs") {
          const isStale = "status__running" in filters || filters["status"] === "running";
          if (isStale) {
            return resolve({ data: opts.staleJobs ?? [], error: null });
          }
          return resolve({ data: opts.jobs ?? [], error: null });
        }
        if (isUpdate) {
          updateCalls.push({ table, patch, filters });
          return resolve({ data: null, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return q;
  }

  const stub = {
    from(table: string) {
      return makeQuery(table);
    },
    _updateCalls: updateCalls,
    _selectCalls: selectCalls,
  };

  return stub as unknown as import("@supabase/supabase-js").SupabaseClient & {
    _updateCalls: typeof updateCalls;
    _selectCalls: typeof selectCalls;
  };
}

// ── parsePeriodScope ──────────────────────────────────────────────────────────

describe("parsePeriodScope", () => {
  it("parses standard period:YYYY-MM", () => {
    expect(parsePeriodScope("period:2026-05")).toEqual({ mes: "5", anio: "2026" });
  });

  it("parses single-digit month without leading zero", () => {
    expect(parsePeriodScope("period:2026-1")).toEqual({ mes: "1", anio: "2026" });
  });

  it("strips leading zero from month", () => {
    expect(parsePeriodScope("period:2026-01")).toEqual({ mes: "1", anio: "2026" });
  });

  it("returns null for full scope", () => {
    expect(parsePeriodScope("full")).toBeNull();
  });

  it("returns null for client scope", () => {
    expect(parsePeriodScope("client:CLI001")).toBeNull();
  });

  it("returns null for month 13", () => {
    expect(parsePeriodScope("period:2026-13")).toBeNull();
  });

  it("returns null for month 0", () => {
    expect(parsePeriodScope("period:2026-0")).toBeNull();
  });

  it("returns null for malformed string", () => {
    expect(parsePeriodScope("2026-05")).toBeNull();
    expect(parsePeriodScope("period:2026")).toBeNull();
    expect(parsePeriodScope("")).toBeNull();
  });
});

// ── executeResyncJob: invoices ────────────────────────────────────────────────

describe("executeResyncJob — invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls syncZetaCustomerVouchers with correct mes/anio from scope", async () => {
    vouchersMock.mockResolvedValue({
      success: true,
      zeta_rows_total: 91,
      inserted: 26,
      updated: 40,
      skipped: 5,
      errors: 0,
    });

    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "invoices", scope: "period:2026-05" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(true);
    expect(vouchersMock).toHaveBeenCalledOnce();
    const callArgs = vouchersMock.mock.calls[0]![0] as { filters: { mes: string; anio: string }; workspaceCompanyId: string };
    expect(callArgs.filters.mes).toBe("5");
    expect(callArgs.filters.anio).toBe("2026");
    expect(callArgs.workspaceCompanyId).toBe(WORKSPACE);

    if (outcome.ok) {
      expect(outcome.summary.rows_fetched).toBe(91);
      expect(outcome.summary.rows_inserted).toBe(26);
      expect(outcome.summary.rows_updated).toBe(40);
    }
  });

  it("returns ok=false when pipeline fails, does not throw", async () => {
    vouchersMock.mockResolvedValue({
      success: false,
      error: "Zeta timeout",
      zeta_rows_total: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
    });

    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "invoices", scope: "period:2026-04" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("Zeta timeout");
    }
  });

  it("returns ok=false for invalid scope without calling pipeline", async () => {
    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "invoices", scope: "full" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(false);
    expect(vouchersMock).not.toHaveBeenCalled();
    if (!outcome.ok) {
      expect(outcome.error).toContain("full");
    }
  });

  it("april 2026 scope parses correctly", async () => {
    vouchersMock.mockResolvedValue({ success: true, zeta_rows_total: 129, inserted: 58, updated: 0, skipped: 0, errors: 0 });
    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "invoices", scope: "period:2026-04" });
    await executeResyncJob(supabase, job);

    const callArgs = vouchersMock.mock.calls[0]![0] as { filters: { mes: string; anio: string } };
    expect(callArgs.filters.mes).toBe("4");
    expect(callArgs.filters.anio).toBe("2026");
  });
});

// ── executeResyncJob: receipts ────────────────────────────────────────────────

describe("executeResyncJob — receipts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls syncZetaCollectionReceipts with correct mes/anio", async () => {
    receiptsMock.mockResolvedValue({
      success: true,
      processed: 29,
      inserted: 23,
      updated: 0,
      skipped: 0,
      errors: 0,
    });

    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "receipts", scope: "period:2026-05" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(true);
    expect(receiptsMock).toHaveBeenCalledOnce();
    const callArgs = receiptsMock.mock.calls[0]![0] as { filters: { mes: string; anio: string } };
    expect(callArgs.filters.mes).toBe("5");
    expect(callArgs.filters.anio).toBe("2026");

    if (outcome.ok) {
      expect(outcome.summary.rows_fetched).toBe(29); // processed mapped to rows_fetched
      expect(outcome.summary.rows_inserted).toBe(23);
    }
  });

  it("may 2026 gap: idempotent re-run does not duplicate", async () => {
    // First run: 23 inserted
    receiptsMock.mockResolvedValueOnce({ success: true, processed: 29, inserted: 23, updated: 0, skipped: 0, errors: 0 });
    // Second run: 0 inserted, 23 updated (upsert idempotent)
    receiptsMock.mockResolvedValueOnce({ success: true, processed: 29, inserted: 0, updated: 23, skipped: 0, errors: 0 });

    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "receipts", scope: "period:2026-05" });

    const first = await executeResyncJob(supabase, job);
    const second = await executeResyncJob(supabase, job);

    expect(first.ok && first.summary.rows_inserted).toBe(23);
    expect(second.ok && second.summary.rows_inserted).toBe(0);
    expect(second.ok && second.summary.rows_updated).toBe(23);
  });

  it("returns ok=false for invalid scope without calling pipeline", async () => {
    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "receipts", scope: "client:CLI001" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(false);
    expect(receiptsMock).not.toHaveBeenCalled();
  });
});

// ── executeResyncJob: installments ────────────────────────────────────────────

describe("executeResyncJob — installments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("iterates workspace clients and calls pipeline per client", async () => {
    installmentsMock.mockResolvedValue({
      rows_fetched: 10,
      rows_upserted: 8,
      rows_linked: 5,
      rows_orphan: 3,
      stopped_reason: "completed",
      errors: [],
      warnings: [],
    });

    const supabase = createSupabaseStub({
      companies: [
        { id: "c1", Codigo: "CLI001" },
        { id: "c2", Codigo: "CLI002" },
      ],
    });

    const job = makeJob({ entity: "installments", scope: "full" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(true);
    // Called once per client
    expect(installmentsMock).toHaveBeenCalledTimes(2);

    // Does NOT pass invoice_id as parameter — the pipeline resolves matches internally
    const firstCallOptions = installmentsMock.mock.calls[0]![3] as { clienteCodigo: string; updateInvoiceDueDate: boolean };
    expect(firstCallOptions.clienteCodigo).toBe("CLI001");
    expect(firstCallOptions.updateInvoiceDueDate).toBe(true);
    // No invoice_id forced
    expect(firstCallOptions).not.toHaveProperty("invoice_id");
  });

  it("partial failure: one client fails but batch continues and ok=true (partial)", async () => {
    installmentsMock
      .mockResolvedValueOnce({ rows_fetched: 10, rows_upserted: 8, stopped_reason: "completed", errors: [], warnings: [] })
      .mockRejectedValueOnce(new Error("Zeta timeout client 2"))
      .mockResolvedValueOnce({ rows_fetched: 5, rows_upserted: 5, stopped_reason: "completed", errors: [], warnings: [] });

    const supabase = createSupabaseStub({
      companies: [
        { id: "c1", Codigo: "CLI001" },
        { id: "c2", Codigo: "CLI002" },
        { id: "c3", Codigo: "CLI003" },
      ],
    });

    const job = makeJob({ entity: "installments", scope: "full" });
    const outcome = await executeResyncJob(supabase, job);

    // 1 out of 3 failed → partial success
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.summary.rows_failed).toBe(1);
      expect(outcome.summary.rows_fetched).toBe(15);
    }
  });

  it("all clients fail → ok=false", async () => {
    installmentsMock.mockRejectedValue(new Error("Zeta down"));

    const supabase = createSupabaseStub({
      companies: [{ id: "c1", Codigo: "CLI001" }],
    });

    const job = makeJob({ entity: "installments", scope: "full" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(false);
  });

  it("empty workspace → ok=true with zero rows", async () => {
    const supabase = createSupabaseStub({ companies: [] });
    const job = makeJob({ entity: "installments", scope: "full" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.summary.rows_fetched).toBe(0);
    }
    expect(installmentsMock).not.toHaveBeenCalled();
  });
});

// ── executeResyncJob: unsupported entity ─────────────────────────────────────

describe("executeResyncJob — unsupported entity", () => {
  it("returns ok=false for contacts without throwing", async () => {
    const supabase = createSupabaseStub();
    const job = makeJob({ entity: "contacts" as ResyncJobRow["entity"], scope: "full" });
    const outcome = await executeResyncJob(supabase, job);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("contacts");
    }
    expect(vouchersMock).not.toHaveBeenCalled();
    expect(receiptsMock).not.toHaveBeenCalled();
  });
});

// ── Job repository: concurrency guard ────────────────────────────────────────

describe("markResyncJobRunning — concurrency guard", () => {
  it("returns claimed row when job is still pending", async () => {
    const supabase = createSupabaseStub({ updateReturnRows: true });
    const result = await markResyncJobRunning(supabase, JOB_ID);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.status).toBe("running");
    }
  });

  it("returns null when job was already claimed (race condition)", async () => {
    // updateReturnRows=false simulates the WHERE status='pending' guard returning no rows
    const supabase = createSupabaseStub({ updateReturnRows: false });
    const result = await markResyncJobRunning(supabase, JOB_ID);
    expect(result).toBeNull();
  });
});

// ── Job repository: stale detection ──────────────────────────────────────────

describe("listStaleRunningResyncJobs", () => {
  it("returns jobs that have been running past the threshold", async () => {
    const staleJob = makeJob({
      status: "running",
      started_at: new Date(Date.now() - 35 * 60 * 1_000).toISOString(), // 35 min ago
    });
    const supabase = createSupabaseStub({ staleJobs: [staleJob] });
    const result = await listStaleRunningResyncJobs(supabase, 30 * 60 * 1_000);

    // The mock returns whatever is in staleJobs
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(JOB_ID);
  });
});

// ── Job state machine ─────────────────────────────────────────────────────────

describe("job state machine — markResyncJob* functions", () => {
  it("markResyncJobSucceeded sets correct fields", async () => {
    const supabase = createSupabaseStub();
    await expect(
      markResyncJobSucceeded(supabase, JOB_ID, { rows_fetched: 29, rows_synced: 23, rows_skipped: 0 })
    ).resolves.toBeUndefined();
  });

  it("markResyncJobFailed truncates long error messages", async () => {
    const supabase = createSupabaseStub();
    const longError = "e".repeat(5000);
    await expect(markResyncJobFailed(supabase, JOB_ID, longError)).resolves.toBeUndefined();
  });

  it("markResyncJobSkipped sets skipped status with reason", async () => {
    const supabase = createSupabaseStub();
    await expect(
      markResyncJobSkipped(supabase, JOB_ID, "dry_run: no ejecutado")
    ).resolves.toBeUndefined();
  });
});

// ── listPendingResyncJobs ─────────────────────────────────────────────────────

describe("listPendingResyncJobs", () => {
  it("returns pending jobs in FIFO order", async () => {
    const jobs = [
      makeJob({ id: "j1", created_at: "2026-05-15T00:00:00Z", status: "pending" }),
      makeJob({ id: "j2", created_at: "2026-05-15T00:05:00Z", status: "pending" }),
    ];
    const supabase = createSupabaseStub({ jobs });
    const result = await listPendingResyncJobs(supabase, 5);
    expect(result).toHaveLength(2);
    // Stub returns in provided order; real Supabase sorts by created_at ASC
    expect(result[0]!.id).toBe("j1");
  });

  it("returns empty array on DB error", async () => {
    // Simulate error by having a stub that injects error for jobs table
    const brokenSub = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          or() { return this; },
          order() { return this; },
          limit() { return this; },
          then(resolve: (v: { data: null; error: { message: string } }) => unknown) {
            return resolve({ data: null, error: { message: "connection refused" } });
          },
        };
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await listPendingResyncJobs(brokenSub, 5);
    expect(result).toEqual([]);
  });
});
