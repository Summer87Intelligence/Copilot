import { describe, expect, it } from "vitest";

import type { SantanderParsedMovement } from "@/lib/treasury/santander-statement-parser";
import {
  buildSantanderImportSummary,
  enrichSantanderImportRows,
  normalizeBankMatchText,
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

describe("transfer_method matching", () => {
  it("transfer_method exacto matchea descripción Santander Dolby", () => {
    const rows = enrichSantanderImportRows({
      rows: [
        baseRow({
          description: "CREDITO POR OPERACION EN SUPERNET TA 2941/DOLBY SOCIEDAD ANONIMA",
          currencyCode: "USD",
          movementType: "credit",
        }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c1", name: "Dolby SA", debtUyu: 0, debtUsd: 0, transferAliases: ["DOLBY SOCIEDAD ANONIMA"] },
      ],
      existingExternalIds: new Set(),
    });
    const row = rows[0]!;
    expect(row.status).toBe("possible");
    const tmMatch = row.matches.find((m) => m.matchReason === "Forma de transferencia");
    expect(tmMatch).toBeDefined();
    expect(tmMatch?.confidence).toBeGreaterThanOrEqual(70);
    expect(tmMatch?.transferMethodMatched).toBe("DOLBY SOCIEDAD ANONIMA");
  });

  it("transfer_method Petrovic matchea descripción", () => {
    const rows = enrichSantanderImportRows({
      rows: [
        baseRow({
          description: "TRANSFERENCIA RECIBIDA DE PETROVIC SOLUTIONS SRL",
          currencyCode: "UYU",
          movementType: "credit",
          amount: 50000,
        }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c2", name: "Petrovic", debtUyu: 0, debtUsd: 0, transferAliases: ["PETROVIC SOLUTIONS"] },
      ],
      existingExternalIds: new Set(),
    });
    const tmMatch = rows[0]?.matches.find((m) => m.matchReason === "Forma de transferencia");
    expect(tmMatch).toBeDefined();
    expect(rows[0]?.status).toBe("possible");
  });

  it("transfer_method vacío no genera match", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ description: "TRANSFERENCIA RECIBIDA" })],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c3", name: "ClienteX", debtUyu: 0, debtUsd: 0, transferAliases: [] },
      ],
      existingExternalIds: new Set(),
    });
    const tmMatch = rows[0]?.matches.find((m) => m.matchReason === "Forma de transferencia");
    expect(tmMatch).toBeUndefined();
  });

  it("transfer_method corto genérico 'BROU' no genera match", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ description: "PAGO VIA BROU TRANSFERENCIA" })],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c4", name: "Cliente Generico", debtUyu: 0, debtUsd: 0, transferAliases: ["BROU"] },
      ],
      existingExternalIds: new Set(),
    });
    const tmMatch = rows[0]?.matches.find((m) => m.matchReason === "Forma de transferencia");
    expect(tmMatch).toBeUndefined();
  });

  it("transfer_method con tildes y mayúsculas matchea normalizado", () => {
    const rows = enrichSantanderImportRows({
      rows: [
        baseRow({
          description: "CREDITO CARDONA ROMERO CARLOS DANILO OPERACION 8821",
          currencyCode: "UYU",
          movementType: "credit",
        }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [
        {
          id: "c5",
          name: "Cardona",
          debtUyu: 0,
          debtUsd: 0,
          transferAliases: ["CARDONA ROMERO CARLOS DÁNILO"],
        },
      ],
      existingExternalIds: new Set(),
    });
    const tmMatch = rows[0]?.matches.find((m) => m.matchReason === "Forma de transferencia");
    expect(tmMatch).toBeDefined();
  });

  it("transfer_method match tiene confidence más alta que solo nombre corto", () => {
    const rowsWithTm = enrichSantanderImportRows({
      rows: [
        baseRow({
          description: "CREDITO POR OPERACION EN SUPERNET TA 2941/DOLBY SOCIEDAD ANONIMA",
        }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c6", name: "Dolby", debtUyu: 0, debtUsd: 366, transferAliases: ["DOLBY SOCIEDAD ANONIMA"] },
      ],
      existingExternalIds: new Set(),
    });
    const rowsNameOnly = enrichSantanderImportRows({
      rows: [
        baseRow({
          description: "CREDITO POR OPERACION EN SUPERNET TA 2941/DOLBY SOCIEDAD ANONIMA",
        }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c6", name: "Dolby", debtUyu: 0, debtUsd: 366, transferAliases: [] },
      ],
      existingExternalIds: new Set(),
    });
    const tmConf = rowsWithTm[0]?.matches[0]?.confidence ?? 0;
    const nameConf = rowsNameOnly[0]?.matches[0]?.confidence ?? 0;
    expect(tmConf).toBeGreaterThan(nameConf);
  });

  it("si hay dos clientes, el de mayor score queda primero", () => {
    const rows = enrichSantanderImportRows({
      rows: [
        baseRow({
          description: "CREDITO POR OPERACION EN SUPERNET TA 2941/DOLBY SOCIEDAD ANONIMA",
        }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c7a", name: "Dolby SA", debtUyu: 0, debtUsd: 0, transferAliases: ["DOLBY SOCIEDAD ANONIMA"] },
        { id: "c7b", name: "Otro Cliente", debtUyu: 0, debtUsd: 0, transferAliases: [] },
      ],
      existingExternalIds: new Set(),
    });
    const matches = rows[0]?.matches ?? [];
    expect(matches[0]?.id).toBe("c7a");
    expect(matches[0]?.matchReason).toBe("Forma de transferencia");
  });

  it("preview no persiste nada: enrichSantanderImportRows es función pura sin I/O", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ description: "DOLBY SOCIEDAD ANONIMA PAGO" })],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c8", name: "Dolby", debtUyu: 0, debtUsd: 0, transferAliases: ["DOLBY SOCIEDAD ANONIMA"] },
      ],
      existingExternalIds: new Set(),
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.status).toBe("possible");
  });

  it("normalizeBankMatchText normaliza tildes y puntuación", () => {
    expect(normalizeBankMatchText("DÁNILO PÉREZ S.A.").trim()).toBe("danilo perez s a");
  });

  it("cliente con múltiples aliases: usa el que mejor matchea", () => {
    const rows = enrichSantanderImportRows({
      rows: [
        baseRow({
          description: "CREDITO POR OPERACION EN SUPERNET TA 2941/DOLBY SOCIEDAD ANONIMA",
          currencyCode: "USD",
          movementType: "credit",
        }),
      ],
      manualMovements: [],
      receipts: [],
      clients: [
        {
          id: "c9",
          name: "Dolby Corp",
          debtUyu: 0,
          debtUsd: 0,
          transferAliases: ["DOLBY CORP ALIAS VIEJO", "DOLBY SOCIEDAD ANONIMA"],
        },
      ],
      existingExternalIds: new Set(),
    });
    const tmMatch = rows[0]?.matches.find((m) => m.matchReason === "Forma de transferencia");
    expect(tmMatch).toBeDefined();
    expect(tmMatch?.transferMethodMatched).toBe("DOLBY SOCIEDAD ANONIMA");
    expect(tmMatch?.confidence).toBeGreaterThanOrEqual(70);
  });

  it("alias inactivo no matchea (array vacío equivalente)", () => {
    const rows = enrichSantanderImportRows({
      rows: [baseRow({ description: "CREDITO POR OPERACION DOLBY SOCIEDAD ANONIMA" })],
      manualMovements: [],
      receipts: [],
      clients: [
        { id: "c10", name: "Dolby", debtUyu: 0, debtUsd: 0, transferAliases: [] },
      ],
      existingExternalIds: new Set(),
    });
    const tmMatch = rows[0]?.matches.find((m) => m.matchReason === "Forma de transferencia");
    expect(tmMatch).toBeUndefined();
  });
});
