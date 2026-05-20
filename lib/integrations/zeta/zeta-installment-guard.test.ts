import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sumOpenInstallmentSaldoForInvoice,
  INSTALLMENT_SALDO_EPSILON,
} from "./zeta-installment-guard";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function makeSupabase(rows: Array<{ cuota_saldo: number }> | null, error?: string): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockResolvedValue(
      error
        ? { data: null, error: { message: error } }
        : { data: rows, error: null }
    ),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// sumOpenInstallmentSaldoForInvoice
// ---------------------------------------------------------------------------

describe("sumOpenInstallmentSaldoForInvoice", () => {
  const WID = "ws-001";
  const INV = "inv-001";

  it("returns 0 when no rows match (invoice has no pending installments)", async () => {
    const sb = makeSupabase([]);
    const result = await sumOpenInstallmentSaldoForInvoice(sb, WID, INV);
    expect(result).toBe(0);
  });

  it("returns sum of cuota_saldo when installments are pending", async () => {
    const sb = makeSupabase([{ cuota_saldo: 500 }, { cuota_saldo: 300 }]);
    const result = await sumOpenInstallmentSaldoForInvoice(sb, WID, INV);
    expect(result).toBe(800);
  });

  it("rounds result to 2 decimal places", async () => {
    const sb = makeSupabase([{ cuota_saldo: 100.333 }, { cuota_saldo: 200.667 }]);
    const result = await sumOpenInstallmentSaldoForInvoice(sb, WID, INV);
    expect(result).toBe(301);
  });

  it("returns null on DB error — conservative block", async () => {
    const sb = makeSupabase(null, "connection refused");
    const result = await sumOpenInstallmentSaldoForInvoice(sb, WID, INV);
    expect(result).toBeNull();
  });

  it("returns null when supabase.from throws — conservative block", async () => {
    const sb = {
      from: vi.fn().mockImplementation(() => { throw new Error("unexpected"); }),
    } as unknown as SupabaseClient;
    const result = await sumOpenInstallmentSaldoForInvoice(sb, WID, INV);
    expect(result).toBeNull();
  });

  it("filters by workspace_company_id — no cross-workspace contamination", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const sb = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await sumOpenInstallmentSaldoForInvoice(sb, "ws-tenant-A", INV);

    // eq should have been called with workspace_company_id = "ws-tenant-A"
    const eqCalls = chain.eq.mock.calls as Array<[string, string]>;
    const wsCall = eqCalls.find(([col]) => col === "workspace_company_id");
    expect(wsCall).toBeDefined();
    expect(wsCall![1]).toBe("ws-tenant-A");
  });

  it("INSTALLMENT_SALDO_EPSILON is 0.005", () => {
    expect(INSTALLMENT_SALDO_EPSILON).toBe(0.005);
  });

  it("returns 0 for null data (treats null rows same as empty)", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const sb = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const result = await sumOpenInstallmentSaldoForInvoice(sb, WID, INV);
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Guard behavior: zero_pass_blocked_by_installments
// Verifies that callers treating null or saldo > epsilon as "block" is correct.
// ---------------------------------------------------------------------------

describe("guard contract: null means block", () => {
  it("null > INSTALLMENT_SALDO_EPSILON is false, but null === null means block", () => {
    const saldo: number | null = null;
    const shouldBlock = saldo === null || saldo > INSTALLMENT_SALDO_EPSILON;
    expect(shouldBlock).toBe(true);
  });

  it("saldo = 0 should NOT block", () => {
    const saldo: number | null = 0;
    const shouldBlock = saldo === null || saldo > INSTALLMENT_SALDO_EPSILON;
    expect(shouldBlock).toBe(false);
  });

  it("saldo = 0.001 (below epsilon) should NOT block", () => {
    const saldo: number | null = 0.001;
    const shouldBlock = saldo === null || saldo > INSTALLMENT_SALDO_EPSILON;
    expect(shouldBlock).toBe(false);
  });

  it("saldo = 1.00 should block", () => {
    const saldo: number | null = 1.0;
    const shouldBlock = saldo === null || saldo > INSTALLMENT_SALDO_EPSILON;
    expect(shouldBlock).toBe(true);
  });
});
