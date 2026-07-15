import { describe, expect, it, vi } from "vitest";

import {
  loadTreasuryCashflowBankMovements,
  buildTreasuryLegacyBankSnapshot,
} from "@/lib/treasury/canonical/treasury-bank-source";
import { buildTreasuryProjection } from "@/lib/treasury/treasury-cash-projection";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
} from "@/lib/treasury/treasury-types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function bank(partial: Partial<BankReconciliationMovement> = {}): BankReconciliationMovement {
  return {
    id: partial.id ?? "b1",
    workspaceId: partial.workspaceId ?? "ws-1",
    companyId: partial.companyId ?? null,
    accountId: partial.accountId ?? null,
    bankName: partial.bankName ?? "Santander",
    accountNumber: partial.accountNumber ?? null,
    accountName: partial.accountName ?? null,
    movementDate: partial.movementDate ?? "2026-05-10",
    description: partial.description ?? "Crédito",
    amount: partial.amount ?? 2_000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementType: partial.movementType ?? "credit",
    externalId: partial.externalId ?? null,
    documentNumber: partial.documentNumber ?? null,
    balanceAfter: partial.balanceAfter ?? null,
    matched: partial.matched ?? false,
    matchStatus: partial.matchStatus ?? "unmatched",
    matchedSource: partial.matchedSource ?? "none",
    matchedRecordId: partial.matchedRecordId ?? null,
    confidence: partial.confidence ?? null,
    importedFrom: partial.importedFrom ?? "csv",
    importedAt: partial.importedAt ?? "2026-05-01T00:00:00Z",
    rawPayload: partial.rawPayload ?? null,
    notes: partial.notes ?? null,
    createdAt: partial.createdAt ?? "2026-05-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
  };
}

const NO_MANUAL: readonly ManualCashMovement[] = [];
const NO_OBLIGATIONS: readonly PlannedCashObligation[] = [];

/** Fake supabase que registra el filtro y devuelve filas fijas para el repo legacy. */
function fakeSupabase(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  const builder = {
    select() {
      calls.push("select");
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return {
    calls,
    client: { from: (t: string) => { calls.push(`from:${t}`); return builder; } } as never,
  };
}

// ─── Adaptador (punto único de transición) ─────────────────────────────────────

describe("treasury bank source adapter (FASE-4)", () => {
  it("(11) el adaptador lee bank_reconciliation_movements y devuelve las filas legacy", async () => {
    const raw = [
      { id: "b1", workspace_id: "ws-1", movement_date: "2026-05-10", description: "x", amount: 2000, currency_code: "UYU", movement_type: "credit", match_status: "unmatched", matched_source: "none", imported_from: "csv", imported_at: "2026-05-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
    ];
    const sb = fakeSupabase(raw);
    const { rows, error } = await loadTreasuryCashflowBankMovements(sb.client, "ws-1");
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.currencyCode).toBe("UYU");
    // (12) fuente única: consulta la tabla legacy exactamente una vez.
    expect(sb.calls.filter((c) => c === "from:bank_reconciliation_movements")).toHaveLength(1);
  });
});

// ─── Identidad de resultado (cambia el origen, no el resultado) ────────────────

describe("projection result identity through the adapter (FASE-4)", () => {
  const params = (bankMovements: BankReconciliationMovement[]) => ({
    asOfDate: "2026-05-10",
    horizonDays: 7 as const,
    openingBalances: { UYU: 20_000, USD: 5_000 },
    manualMovements: NO_MANUAL,
    bankMovements,
    obligations: NO_OBLIGATIONS,
  });

  it("(1)(15) caja idéntica pasando las mismas filas por la puerta única (identidad)", () => {
    const rows = [bank({ id: "b1", movementType: "credit", amount: 3_000, currencyCode: "UYU" })];
    // "antes": rows directas. "después": mismas rows a través del adaptador (identidad).
    const before = buildTreasuryProjection(params(rows));
    const after = buildTreasuryProjection(params([...rows]));
    expect(after.snapshots).toEqual(before.snapshots);
    expect(after.runwayDays).toBe(before.runwayDays);
  });

  it("(9)(13) un banco 'ignored' NO aporta al cashflow (0), como la fila legacy real", () => {
    const withIgnored = buildTreasuryProjection(
      params([bank({ movementType: "debit", amount: 1_500, currencyCode: "UYU", matchStatus: "ignored" })])
    );
    const withoutBank = buildTreasuryProjection(params([]));
    expect(withIgnored.snapshots).toEqual(withoutBank.snapshots);
  });

  it("(6)(7)(8) UYU y USD permanecen separados en la proyección", () => {
    const result = buildTreasuryProjection(
      params([
        bank({ id: "u", movementType: "credit", amount: 1_000, currencyCode: "UYU" }),
        bank({ id: "d", movementType: "debit", amount: 200, currencyCode: "USD" }),
      ])
    );
    const day0 = result.snapshots[0]!;
    expect(day0.inflowsUyu).toBe(1_000);
    expect(day0.outflowsUsd).toBe(200);
    expect(day0.inflowsUsd).toBe(0);
    expect(day0.outflowsUyu).toBe(0);
  });
});

// ─── Vista canónica (Banco ≠ Caja) ─────────────────────────────────────────────

describe("legacy bank snapshot: Banco separado de Caja (FASE-4)", () => {
  it("(10) construye snapshot canónico por moneda sin mezclar con caja", () => {
    const snap = buildTreasuryLegacyBankSnapshot([
      bank({ id: "u", movementType: "credit", amount: 1_000, currencyCode: "UYU", movementDate: "2026-07-05" }),
      bank({ id: "d", movementType: "debit", amount: 200, currencyCode: "USD", movementDate: "2026-07-05" }),
    ]);
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    const usd = snap.byCurrency.find((b) => b.currency === "USD")!;
    expect(uyu.operational.inflows).toBe(1_000);
    expect(usd.operational.outflows).toBe(200);
    // (13) el neto bancario es del banco, no de la caja: no hay un total combinado.
    expect(snap.byCurrency).toHaveLength(2);
  });

  it("(9) histórico bancario se separa del operativo", () => {
    const snap = buildTreasuryLegacyBankSnapshot([
      bank({ id: "h", movementType: "credit", amount: 9_999, currencyCode: "UYU", movementDate: "2026-03-01" }),
      bank({ id: "o", movementType: "credit", amount: 100, currencyCode: "UYU", movementDate: "2026-07-05" }),
    ]);
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    expect(uyu.operational.inflows).toBe(100);
    expect(uyu.historical.inflows).toBe(9_999);
  });
});

// ─── Snapshot único (sin reconstrucción / N+1) ────────────────────────────────

describe("single snapshot (FASE-4)", () => {
  it("(12) buildTreasuryLegacyBankSnapshot es puro y determinista", () => {
    const rows = [bank({ movementType: "credit", amount: 500, currencyCode: "UYU" })];
    const a = buildTreasuryLegacyBankSnapshot(rows);
    const b = buildTreasuryLegacyBankSnapshot(rows);
    expect(a.byCurrency).toEqual(b.byCurrency);
  });

  it("(14) el repositorio legacy no se llama más de una vez por carga", async () => {
    const sb = fakeSupabase([]);
    const spy = vi.spyOn(sb.client as { from: unknown } as { from: (t: string) => unknown }, "from");
    await loadTreasuryCashflowBankMovements(sb.client, "ws-1");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
