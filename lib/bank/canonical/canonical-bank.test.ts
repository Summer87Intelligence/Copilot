import { describe, expect, it } from "vitest";

import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import type { BankReconciliationMovement } from "@/lib/treasury/treasury-types";
import {
  BANK_OPERATIONAL_START_DATE,
  buildBankActivityReportModel,
  buildBankMovementFingerprint,
  buildCanonicalBankSnapshot,
  classifyDuplicate,
  detectCrossSourceDuplicates,
  isBankMovementDateHistorical,
  isBankMovementHistorical,
  partitionByHistorical,
  toCanonicalFromBankMovement,
  toCanonicalFromLegacy,
  type CanonicalBankMovement,
} from "@/lib/bank/canonical";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function bankMovement(partial: Partial<BankMovement> = {}): BankMovement {
  return {
    id: partial.id ?? "mov-1",
    workspace_id: partial.workspace_id ?? "ws-1",
    import_id: partial.import_id ?? null,
    bank_name: partial.bank_name ?? "Santander",
    account_label: partial.account_label ?? "1211749",
    movement_date: partial.movement_date ?? "2026-07-05",
    description: partial.description ?? "Transferencia recibida",
    raw_description: partial.raw_description ?? null,
    amount: partial.amount ?? 1000,
    currency: partial.currency ?? "UYU",
    direction: partial.direction ?? "inflow",
    bank_reference: partial.bank_reference ?? "REF-1",
    status: partial.status ?? "pending",
    matched_type: partial.matched_type ?? null,
    matched_id: partial.matched_id ?? null,
    matched_confidence: partial.matched_confidence ?? null,
    matched_by: partial.matched_by ?? null,
    matched_at: partial.matched_at ?? null,
    metadata: partial.metadata ?? null,
    created_at: partial.created_at ?? "2026-07-05T12:00:00Z",
    updated_at: partial.updated_at ?? "2026-07-05T12:00:00Z",
  };
}

function legacyMovement(
  partial: Partial<BankReconciliationMovement> = {}
): BankReconciliationMovement {
  return {
    id: partial.id ?? "leg-1",
    workspaceId: partial.workspaceId ?? "ws-1",
    companyId: partial.companyId ?? null,
    accountId: partial.accountId ?? "acc-1",
    bankName: partial.bankName ?? "Santander",
    accountNumber: partial.accountNumber ?? null,
    accountName: partial.accountName ?? null,
    movementDate: partial.movementDate ?? "2026-05-13",
    description: partial.description ?? "Pago proveedor",
    amount: partial.amount ?? 500,
    currencyCode: partial.currencyCode ?? "UYU",
    movementType: partial.movementType ?? "debit",
    externalId: partial.externalId ?? null,
    documentNumber: partial.documentNumber ?? null,
    balanceAfter: partial.balanceAfter ?? null,
    matched: partial.matched ?? false,
    matchStatus: partial.matchStatus ?? "unmatched",
    matchedSource: partial.matchedSource ?? "none",
    matchedRecordId: partial.matchedRecordId ?? null,
    confidence: partial.confidence ?? null,
    importedFrom: partial.importedFrom ?? "manual",
    importedAt: partial.importedAt ?? "2026-05-13T10:00:00Z",
    rawPayload: partial.rawPayload ?? null,
    notes: partial.notes ?? null,
    createdAt: partial.createdAt ?? "2026-05-13T10:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-05-13T10:00:00Z",
  };
}

function canonicalList(rows: BankMovement[]): CanonicalBankMovement[] {
  return rows.map((r) => toCanonicalFromBankMovement(r).movement);
}

// ─── Política temporal ─────────────────────────────────────────────────────────

describe("historical policy", () => {
  it("centraliza la fecha de corte", () => {
    expect(BANK_OPERATIONAL_START_DATE).toBe("2026-07-01");
  });

  it("(3) movimiento anterior a 2026-07-01 es histórico", () => {
    expect(isBankMovementDateHistorical("2026-06-30")).toBe(true);
  });

  it("(4) movimiento exactamente 2026-07-01 es operativo", () => {
    expect(isBankMovementDateHistorical("2026-07-01")).toBe(false);
    expect(isBankMovementHistorical({ movement_date: "2026-07-01" })).toBe(false);
  });

  it("fecha faltante/ inválida no se trata como histórica (no oculta datos)", () => {
    expect(isBankMovementDateHistorical("")).toBe(false);
    expect(isBankMovementDateHistorical(null)).toBe(false);
  });

  it("partitionByHistorical no pierde registros", () => {
    const items = [{ d: "2026-06-01" }, { d: "2026-07-10" }, { d: "2026-07-01" }];
    const { operational, historical } = partitionByHistorical(items, (i) => i.d);
    expect(historical).toHaveLength(1);
    expect(operational).toHaveLength(2);
  });
});

// ─── Adaptador canónico ────────────────────────────────────────────────────────

describe("bank_movements adapter", () => {
  it("(1) movimiento operativo UYU", () => {
    const { movement, diagnostics } = toCanonicalFromBankMovement(
      bankMovement({ currency: "UYU", movement_date: "2026-07-05", direction: "inflow" })
    );
    expect(movement.currency).toBe("UYU");
    expect(movement.isHistorical).toBe(false);
    expect(movement.direction).toBe("inflow");
    expect(movement.source).toBe("bank_movements");
    expect(diagnostics).toHaveLength(0);
  });

  it("(2) movimiento operativo USD", () => {
    const { movement } = toCanonicalFromBankMovement(
      bankMovement({ currency: "USD", amount: 250 })
    );
    expect(movement.currency).toBe("USD");
    expect(movement.amount).toBe(250);
  });

  it("(5)(6) entrada y salida preservan dirección", () => {
    expect(toCanonicalFromBankMovement(bankMovement({ direction: "inflow" })).movement.direction).toBe(
      "inflow"
    );
    expect(
      toCanonicalFromBankMovement(bankMovement({ direction: "outflow" })).movement.direction
    ).toBe("outflow");
  });

  it("(7) importe se representa como valor absoluto + dirección", () => {
    const { movement } = toCanonicalFromBankMovement(bankMovement({ amount: -300, direction: "outflow" }));
    expect(movement.amount).toBe(300);
    expect(movement.direction).toBe("outflow");
  });

  it("(8) moneda faltante emite diagnóstico", () => {
    const { diagnostics } = toCanonicalFromBankMovement(
      bankMovement({ currency: "EUR" as unknown as BankMovement["currency"] })
    );
    expect(diagnostics.map((d) => d.code)).toContain("missing_currency");
  });

  it("(9) fecha faltante emite diagnóstico", () => {
    const { diagnostics } = toCanonicalFromBankMovement(bankMovement({ movement_date: "" }));
    expect(diagnostics.map((d) => d.code)).toContain("missing_movement_date");
  });

  it("(10) cuenta faltante emite diagnóstico", () => {
    const { diagnostics } = toCanonicalFromBankMovement({
      ...bankMovement(),
      account_label: null,
      bank_name: "",
    });
    expect(diagnostics.map((d) => d.code)).toContain("missing_account");
  });

  it("invalid_amount cuando el importe no es positivo", () => {
    const { diagnostics } = toCanonicalFromBankMovement(bankMovement({ amount: 0 }));
    expect(diagnostics.map((d) => d.code)).toContain("invalid_amount");
  });

  it("(23) conciliado", () => {
    const { movement } = toCanonicalFromBankMovement(
      bankMovement({ status: "matched", matched_id: "obl-1" })
    );
    expect(movement.isReconciled).toBe(true);
    expect(movement.reconciliationStatus).toBe("matched");
  });

  it("(24) pendiente", () => {
    const { movement } = toCanonicalFromBankMovement(bankMovement({ status: "pending" }));
    expect(movement.isReconciled).toBe(false);
  });

  it("conflicting_reconciliation_status cuando matched sin contraparte", () => {
    const { diagnostics } = toCanonicalFromBankMovement(
      bankMovement({ status: "matched", matched_id: null })
    );
    expect(diagnostics.map((d) => d.code)).toContain("conflicting_reconciliation_status");
  });

  it("(25) asociación de ingreso se preserva", () => {
    const { movement } = toCanonicalFromBankMovement(
      bankMovement({ matched_type: "client", matched_id: "cli-1" })
    );
    expect(movement.matchedIncomeId).toBe("cli-1");
  });
});

describe("legacy adapter", () => {
  it("mapea credit→inflow, debit→outflow", () => {
    expect(toCanonicalFromLegacy(legacyMovement({ movementType: "credit" })).movement.direction).toBe(
      "inflow"
    );
    expect(toCanonicalFromLegacy(legacyMovement({ movementType: "debit" })).movement.direction).toBe(
      "outflow"
    );
  });

  it("marca origen legacy y currency", () => {
    const { movement } = toCanonicalFromLegacy(legacyMovement({ currencyCode: "USD" }));
    expect(movement.source).toBe("bank_reconciliation_movements");
    expect(movement.currency).toBe("USD");
  });
});

// ─── Dedup ───────────────────────────────────────────────────────────────────

describe("dedup", () => {
  it("(11) duplicado exacto dentro de bank_movements", () => {
    const a = toCanonicalFromBankMovement(bankMovement({ id: "a" })).movement;
    const b = toCanonicalFromBankMovement(bankMovement({ id: "b" })).movement;
    expect(classifyDuplicate(a, b)).toBe("exact");
    expect(buildBankMovementFingerprint({
      movementDate: a.movementDate,
      currency: a.currency,
      amount: a.amount,
      direction: a.direction,
      normalizedDescription: a.description ?? "",
      accountIdentity: a.accountId ?? "",
    })).toBe(
      buildBankMovementFingerprint({
        movementDate: b.movementDate,
        currency: b.currency,
        amount: b.amount,
        direction: b.direction,
        normalizedDescription: b.description ?? "",
        accountIdentity: b.accountId ?? "",
      })
    );
  });

  it("(12) probable duplicado entre ambas tablas", () => {
    const canonical = toCanonicalFromBankMovement(
      bankMovement({ id: "c", movement_date: "2026-05-13", amount: 500, direction: "outflow", description: "Pago proveedor", account_label: "acc-1" })
    ).movement;
    const legacy = toCanonicalFromLegacy(
      legacyMovement({ id: "l", movementDate: "2026-05-13", amount: 500, movementType: "debit", description: "Pago proveedor", accountId: "acc-1" })
    ).movement;
    expect(classifyDuplicate(canonical, legacy)).toBe("exact");
    const dups = detectCrossSourceDuplicates([canonical, legacy]);
    expect(dups).toHaveLength(1);
  });

  it("(13) dos movimientos legítimos con misma fecha e importe pero distinta descripción → medium, no exact", () => {
    const a = toCanonicalFromBankMovement(bankMovement({ id: "a", description: "Sueldo Ana" })).movement;
    const b = toCanonicalFromBankMovement(bankMovement({ id: "b", description: "Sueldo Beto" })).movement;
    expect(classifyDuplicate(a, b)).toBe("medium");
  });

  it("fecha+importe distinto → none", () => {
    const a = toCanonicalFromBankMovement(bankMovement({ id: "a", amount: 100 })).movement;
    const b = toCanonicalFromBankMovement(bankMovement({ id: "b", amount: 200 })).movement;
    expect(classifyDuplicate(a, b)).toBe("none");
  });
});

// ─── Snapshot ───────────────────────────────────────────────────────────────

describe("snapshot", () => {
  const dataset = () => [
    bankMovement({ id: "op-uyu-in", currency: "UYU", direction: "inflow", amount: 1000, movement_date: "2026-07-05" }),
    bankMovement({ id: "op-uyu-out", currency: "UYU", direction: "outflow", amount: 400, movement_date: "2026-07-06", status: "matched", matched_id: "o1" }),
    bankMovement({ id: "op-usd-in", currency: "USD", direction: "inflow", amount: 200, movement_date: "2026-07-07" }),
    bankMovement({ id: "hist-uyu", currency: "UYU", direction: "inflow", amount: 9999, movement_date: "2026-03-01" }),
    bankMovement({ id: "hist-usd", currency: "USD", direction: "outflow", amount: 5555, movement_date: "2026-02-01" }),
  ];

  it("(16)(21) separa UYU/USD y excluye histórico del operativo", () => {
    const snap = buildCanonicalBankSnapshot({ movements: canonicalList(dataset()) });
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    const usd = snap.byCurrency.find((b) => b.currency === "USD")!;

    expect(uyu.operational.inflows).toBe(1000);
    expect(uyu.operational.outflows).toBe(400);
    expect(uyu.operational.net).toBe(600);
    expect(uyu.historical.inflows).toBe(9999);
    expect(usd.operational.inflows).toBe(200);
    expect(usd.historical.outflows).toBe(5555);
  });

  it("(21) nunca suma UYU + USD", () => {
    const snap = buildCanonicalBankSnapshot({ movements: canonicalList(dataset()) });
    // Cada bloque es independiente; no hay un total combinado.
    expect(snap.byCurrency).toHaveLength(2);
    expect(snap.byCurrency.every((b) => b.currency === "UYU" || b.currency === "USD")).toBe(true);
  });

  it("conciliados vs pendientes solo cuentan operativos", () => {
    const snap = buildCanonicalBankSnapshot({ movements: canonicalList(dataset()) });
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    expect(uyu.operational.reconciledCount).toBe(1);
    expect(uyu.operational.pendingCount).toBe(1);
  });

  it("(22) no doble cuenta duplicado cross-source (excluye legacy)", () => {
    const canonical = toCanonicalFromBankMovement(
      bankMovement({ id: "c", movement_date: "2026-07-05", amount: 500, currency: "UYU", direction: "outflow", description: "Pago X", account_label: "acc-1" })
    ).movement;
    const legacyDup = toCanonicalFromLegacy(
      legacyMovement({ id: "l", movementDate: "2026-07-05", amount: 500, currencyCode: "UYU", movementType: "debit", description: "Pago X", accountId: "acc-1" })
    ).movement;
    const snap = buildCanonicalBankSnapshot({ movements: [canonical, legacyDup] });
    const uyu = snap.byCurrency.find((b) => b.currency === "UYU")!;
    // Solo se cuenta una vez (la canónica), no dos.
    expect(uyu.operational.outflows).toBe(500);
    expect(snap.diagnostics.map((d) => d.code)).toContain("probable_cross_source_duplicate");
  });

  it("(14)(15) legacy sin equivalente y canónico sin equivalente coexisten sin dup", () => {
    const canonical = toCanonicalFromBankMovement(bankMovement({ id: "c", amount: 111 })).movement;
    const legacy = toCanonicalFromLegacy(legacyMovement({ id: "l", amount: 222, movementDate: "2026-07-02", currencyCode: "UYU", movementType: "credit" })).movement;
    const dups = detectCrossSourceDuplicates([canonical, legacy]);
    expect(dups).toHaveLength(0);
  });

  it("(29) snapshot se construye una vez y es determinista", () => {
    const movements = canonicalList(dataset());
    const a = buildCanonicalBankSnapshot({ movements });
    const b = buildCanonicalBankSnapshot({ movements });
    expect(a.byCurrency).toEqual(b.byCurrency);
  });

  it("cutoff refleja BANK_OPERATIONAL_START_DATE", () => {
    const snap = buildCanonicalBankSnapshot({ movements: canonicalList(dataset()) });
    expect(snap.period.cutoff).toBe(BANK_OPERATIONAL_START_DATE);
  });
});

// ─── Reporte ───────────────────────────────────────────────────────────────

describe("bank activity report model", () => {
  it("(18)(19)(28) expone operativo + históricos excluidos, sin llamar 'caja' al neto", () => {
    const snap = buildCanonicalBankSnapshot({
      movements: canonicalList([
        bankMovement({ id: "1", currency: "UYU", direction: "inflow", amount: 1000, movement_date: "2026-07-05" }),
        bankMovement({ id: "2", currency: "UYU", direction: "outflow", amount: 400, movement_date: "2026-07-06" }),
        bankMovement({ id: "3", currency: "UYU", direction: "inflow", amount: 9999, movement_date: "2026-01-01" }),
      ]),
    });
    const report = buildBankActivityReportModel(snap);
    const uyu = report.rows.find((r) => r.currency === "UYU")!;
    expect(uyu.operationalInflows).toBe(1000);
    expect(uyu.operationalOutflows).toBe(400);
    expect(uyu.operationalNet).toBe(600);
    expect(uyu.historicalExcludedCount).toBe(1);
    // El contrato del reporte no expone ninguna clave llamada "caja"/"cash".
    expect(Object.keys(uyu).join(",").toLowerCase()).not.toContain("caja");
    expect(Object.keys(uyu).join(",").toLowerCase()).not.toContain("cash");
  });
});
