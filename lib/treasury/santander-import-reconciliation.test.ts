import { describe, expect, it } from "vitest";

import type { SantanderParsedMovement } from "@/lib/treasury/santander-statement-parser";
import {
  buildSantanderImportSummary,
  enrichSantanderImportRows,
} from "@/lib/treasury/santander-import-reconciliation";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

function baseRow(partial: Partial<SantanderParsedMovement>): SantanderParsedMovement {
  return {
    movementDate: "2026-05-12",
    description: "Recibo Dolby",
    amount: 366,
    currencyCode: "USD",
    movementType: "credit",
    externalId: "ext-1",
    documentNumber: null,
    balanceAfter: null,
    importedFrom: "csv",
    rawPayload: {},
    ...partial,
  };
}

const manualUsd: ManualCashMovement = {
  id: "m1",
  workspaceId: "w",
  companyId: null,
  accountId: null,
  ledgerType: "bank",
  movementType: "income",
  source: "manual",
  concept: "Cobro Dolby",
  category: null,
  amount: 366,
  currencyCode: "USD",
  movementDate: "2026-05-12",
  paymentMethod: null,
  counterparty: "Dolby",
  reference: null,
  notes: null,
  affectsCashflow: true,
  reconciled: false,
  bankReconciliationId: null,
  status: "active",
  createdBy: null,
  createdAt: "",
  updatedAt: "",
  rawPayload: null,
  metadata: null,
};

describe("santander-import-reconciliation", () => {
  it("match exacto por monto/fecha/moneda en tesorería", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({})],
      manualMovements: [manualUsd],
      receipts: [],
      clients: [],
      existingExternalIds: new Set(),
    });
    expect(rows[0]?.status).toBe("missing_zeta");
    expect(rows[0]?.matches[0]?.source).toBe("treasury_manual");
  });

  it("marca crédito sin tesorería como falta en Copilot", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ description: "Transferencia sin match" })],
      manualMovements: [],
      receipts: [],
      clients: [],
      existingExternalIds: new Set(),
    });
    expect(rows[0]?.status).toBe("missing_copilot");
  });

  it("detecta duplicados por externalId", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ externalId: "dup-1" })],
      manualMovements: [],
      receipts: [],
      clients: [],
      existingExternalIds: new Set(["dup-1"]),
    });
    expect(rows[0]?.status).toBe("duplicate");
  });

  it("no mezcla monedas", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ currencyCode: "UYU", amount: 976 })],
      manualMovements: [{ ...manualUsd, currencyCode: "USD", amount: 976 }],
      receipts: [],
      clients: [],
      existingExternalIds: new Set(),
    });
    expect(rows[0]?.status).toBe("missing_copilot");
  });

  it("resumen por moneda no suma UYU y USD", () => {
    const enriched = enrichSantanderImportRows({
      rows: [
        baseRow({ currencyCode: "UYU", amount: 100, externalId: "a" }),
        baseRow({ currencyCode: "USD", amount: 200, externalId: "b" }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [],
      existingExternalIds: new Set(),
    });
    const summary = buildSantanderImportSummary(enriched);
    expect(summary.creditsByCurrency.UYU).toBe(100);
    expect(summary.creditsByCurrency.USD).toBe(200);
  });

  it("match recibo Zeta ±3 días", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ movementDate: "2026-05-14" })],
      manualMovements: [],
      receipts: [
        {
          id: "r1",
          amount: 366,
          currencyCode: "USD",
          receiptDate: "2026-05-12",
          clientName: "Dolby",
          receiptNumber: "RC-1",
        },
      ],
      clients: [],
      existingExternalIds: new Set(),
    });
    expect(rows[0]?.status).toBe("missing_copilot");
    expect(rows[0]?.matches.some((m) => m.source === "zeta_receipt")).toBe(true);
  });
});
