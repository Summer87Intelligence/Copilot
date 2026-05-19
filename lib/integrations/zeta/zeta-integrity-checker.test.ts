/**
 * ZETA-15: Tests for zeta-integrity-checker.
 *
 * Cubre:
 * - violations_critical se computa correctamente (solo severity=critical)
 * - checkInvoiceInvalidIssueDate detecta facturas con issue_date=null
 * - checkReceiptInvalidDate detecta recibos con receipt_date=null
 * - runAllIntegrityChecks retorna violations_critical por check
 * - DB error en un check no rompe los demás (batch isolation)
 * - Checks de tabla inexistente (42P01) se manejan sin error
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { INTEGRITY_CHECK_INVOICE_LIMIT, runAllIntegrityChecks } from "@/lib/integrations/zeta/zeta-integrity-checker";

// ── Mock upsertIntegrityViolation ─────────────────────────────────────────────

const upsertMock = vi.fn();
const resolvestaleMock = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/data/zeta-enterprise-sync-repository", () => ({
  upsertIntegrityViolation: (...args: unknown[]) => upsertMock(...args),
  resolveStaleIntegrityViolations: (...args: unknown[]) => resolvestaleMock(...args),
}));

// ── Supabase stub helpers ──────────────────────────────────────────────────────

const WORKSPACE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type RowMap = Record<string, unknown[]>;
type ErrorMap = Record<string, { message: string; code?: string }>;

/**
 * Minimal Supabase stub that returns rows/errors per (table, filter).
 * Supports: .from().select().eq().like().is().lte().gt().not().lt().in()
 *           .rpc().limit().maybeSingle()
 */
function createStub(rows: RowMap = {}, errors: ErrorMap = {}) {
  function makeQ(key: string) {
    const q: Record<string, unknown> = {
      _key: key,
      // Chaining stubs — parameterless on purpose; ESLint-safe
      select() { return q; },
      eq() { return q; },
      like() { return q; },
      is() { return q; },
      lte() { return q; },
      gt() { return q; },
      not() { return q; },
      lt() { return q; },
      in() { return q; },
      or() { return q; },
      limit() { return q; },
      maybeSingle() { return q; },
      order() { return q; },
      then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
        const err = errors[key] ?? null;
        const data = err ? null : (rows[key] ?? []);
        return resolve({ data, error: err });
      },
    };
    return q;
  }

  return {
    from(table: string) { return makeQ(table); },
    rpc(fn: string) { return makeQ(`rpc:${fn}`); },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("INTEGRITY_CHECK_INVOICE_LIMIT", () => {
  it("anti-regression: must be >= 5000 (cannot regress to 500)", () => {
    expect(INTEGRITY_CHECK_INVOICE_LIMIT).toBeGreaterThanOrEqual(5000);
  });
});

describe("runAllIntegrityChecks — violations_critical tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ id: "v1", isNew: true });
  });

  it("violations_critical=0 when all violations are warning", async () => {
    const supabase = createStub({
      proto_invoices: [
        { id: "i1", invoice_number: "ZETA:CCV1:E1:C1:A:1", currency_code: null },
      ],
    });

    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const nullCurrency = results.find((r) => r.check_name === "invoice_null_currency");
    expect(nullCurrency?.violations_found).toBe(1);
    expect(nullCurrency?.violations_critical).toBe(0); // warning severity, not critical
  });

  it("violations_critical counted correctly for balance_exceeds_total", async () => {
    const supabase = createStub({
      proto_invoices: [
        {
          id: "i1",
          invoice_number: "ZETA:CCV1:E1:C1:A:1",
          total_amount: 100,
          balance_amount: 200,
        },
      ],
    });

    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const balanceCheck = results.find((r) => r.check_name === "invoice_balance_exceeds_total");
    expect(balanceCheck?.violations_found).toBe(1);
    expect(balanceCheck?.violations_critical).toBe(1);
  });

  it("violations_critical=0 when no violations found", async () => {
    const supabase = createStub({}); // all tables return empty arrays
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    for (const r of results) {
      expect(r.violations_critical).toBe(0);
    }
  });

  it("violations_critical=0 on DB error for that check", async () => {
    const supabase = createStub(
      {},
      { proto_invoices: { message: "connection refused" } }
    );
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const balanceCheck = results.find((r) => r.check_name === "invoice_balance_exceeds_total");
    // error → violations_found=0 → violations_critical=0
    expect(balanceCheck?.violations_critical).toBe(0);
    expect(balanceCheck?.error).toContain("connection refused");
  });
});

describe("checkInvoiceBalanceExceedsTotal — monetary epsilon (BALANCE_EPSILON=1.00)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ id: "v1", isNew: true });
  });

  function makeInvoiceStub(total: number, balance: number) {
    return createStub({
      proto_invoices: [
        { id: "i1", invoice_number: "ZETA:CCV1:E1:C1:A:1", total_amount: total, balance_amount: balance },
      ],
    });
  }

  it("diff=0.12 (real rounding case 96623.88 vs 96624) → NO violation", async () => {
    const supabase = makeInvoiceStub(96623.88, 96624);
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "invoice_balance_exceeds_total");
    expect(check?.violations_found).toBe(0);
  });

  it("diff=0.99 → NO violation (within epsilon)", async () => {
    const supabase = makeInvoiceStub(1000, 1000.99);
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "invoice_balance_exceeds_total");
    expect(check?.violations_found).toBe(0);
  });

  it("diff=1.01 → violation (exceeds epsilon)", async () => {
    const supabase = makeInvoiceStub(1000, 1001.01);
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "invoice_balance_exceeds_total");
    expect(check?.violations_found).toBe(1);
    expect(check?.violations_critical).toBe(1);
  });

  it("diff=100 (genuine accounting error) → violation", async () => {
    const supabase = makeInvoiceStub(1000, 1100);
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "invoice_balance_exceeds_total");
    expect(check?.violations_found).toBe(1);
  });

  it("violation metadata includes raw_difference and epsilon_used", async () => {
    const supabase = makeInvoiceStub(1000, 1002);
    await runAllIntegrityChecks(supabase, WORKSPACE);
    const call = (upsertMock.mock.calls as unknown[][]).find(
      (args) => (args[2] as { check_name: string }).check_name === "invoice_balance_exceeds_total"
    );
    expect(call).toBeDefined();
    const violation = call![2] as { metadata: { raw_difference: number; epsilon_used: number } };
    expect(violation.metadata.raw_difference).toBeCloseTo(2, 5);
    expect(violation.metadata.epsilon_used).toBe(1.0);
  });
});

describe("checkInvoiceInvalidIssueDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ id: "v1", isNew: true });
  });

  it("detects invoices with null issue_date", async () => {
    const supabase = createStub({
      proto_invoices: [
        { id: "i1", invoice_number: "ZETA:CCV1:E1:C1:A:1" },
        { id: "i2", invoice_number: "ZETA:CCV1:E1:C1:A:2" },
      ],
    });

    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "invoice_invalid_issue_date");
    expect(check?.violations_found).toBe(2);
    expect(check?.violations_critical).toBe(0); // severity=warning
  });

  it("returns violations_found=0 when no null issue_date rows", async () => {
    const supabase = createStub({ proto_invoices: [] });
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "invoice_invalid_issue_date");
    expect(check?.violations_found).toBe(0);
  });

  it("handles DB error gracefully without breaking other checks", async () => {
    // Make proto_invoices error, but proto_receipts and installments work fine
    const supabase = createStub(
      { "proto_receipts": [] },
      { proto_invoices: { message: "query timeout" } }
    );
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    expect(results.length).toBeGreaterThan(0);
    // Receipt checks should still run
    const receiptDateCheck = results.find((r) => r.check_name === "receipt_invalid_date");
    expect(receiptDateCheck?.error).toBeUndefined(); // no error on receipts check
  });
});

describe("checkReceiptInvalidDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ id: "v1", isNew: true });
  });

  it("detects receipts with null receipt_date", async () => {
    const supabase = createStub({
      proto_receipts: [
        { id: "r1", receipt_number: "ZETA:COB:12345" },
      ],
    });

    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "receipt_invalid_date");
    expect(check?.violations_found).toBe(1);
    expect(check?.violations_critical).toBe(0);
  });

  it("returns violations_found=0 when no null receipt_date rows", async () => {
    const supabase = createStub({ proto_receipts: [] });
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const check = results.find((r) => r.check_name === "receipt_invalid_date");
    expect(check?.violations_found).toBe(0);
  });
});

describe("runAllIntegrityChecks — batch isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ id: "v1", isNew: true });
  });

  it("returns results for all checks even when one check throws", async () => {
    // Simulate a thrown exception mid-check by making upsert throw for specific violations
    upsertMock.mockImplementation(async (_supabase: unknown, _workspaceId: string, violation: { check_name: string }) => {
      if (violation.check_name === "invoice_balance_exceeds_total") throw new Error("upsert failed");
      return { id: "v1", isNew: true };
    });

    const supabase = createStub({
      proto_invoices: [
        { id: "i1", invoice_number: "ZETA:CCV1:E1:C1:A:1", total_amount: 100, balance_amount: 200 },
      ],
    });

    const results = await runAllIntegrityChecks(supabase, WORKSPACE);

    // All checks should be represented in results
    const checkNames = results.map((r) => r.check_name);
    expect(checkNames).toContain("invoice_balance_exceeds_total");
    expect(checkNames).toContain("invoice_null_currency");
    expect(checkNames).toContain("receipt_null_currency");
    expect(results.length).toBeGreaterThanOrEqual(10); // at least all registered checks
  });

  it("installment checks handle 42P01 (table not found) without error", async () => {
    const supabase = createStub(
      {},
      { proto_invoice_installments: { message: 'relation "proto_invoice_installments" does not exist', code: "42P01" } }
    );
    const results = await runAllIntegrityChecks(supabase, WORKSPACE);
    const orphanCheck = results.find((r) => r.check_name === "installment_orphan_no_invoice");
    // 42P01 is silently handled in the check itself → no error propagated
    expect(orphanCheck?.violations_found).toBe(0);
    expect(orphanCheck?.error).toBeUndefined();
  });
});
