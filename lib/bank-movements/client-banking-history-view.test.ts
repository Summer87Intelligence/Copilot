import { describe, expect, it } from "vitest";

import {
  associationRowFromMovement,
  buildBankMovementConsultHref,
  buildClientBankingSummary,
  buildHabitualPaymentPattern,
  buildHowAppearsFromActive,
  extractFrequentDescriptionConcept,
  extractObservedPayerNames,
  filterActiveBankingRows,
  filterCorrectionRows,
  groupCorrections,
  looksLikeNormalizedDescriptionDump,
  pickVisibleAliasName,
  type ClientBankingAssociationRow,
} from "@/lib/bank-movements/client-banking-history-view";

const FULL =
  "CRÉDITO OPERACIÓN EN BANCA DIGITAL 198677 TSUPRASUR S.A./SUPRASUR S.A.";

function row(partial: Partial<ClientBankingAssociationRow>): ClientBankingAssociationRow {
  return {
    id: "id-1",
    movementId: "mov-1",
    status: "identified",
    movementDate: "2026-07-14",
    associatedAt: "2026-07-23T12:00:00Z",
    revokedAt: null,
    importedAt: "2026-07-15T00:00:00Z",
    amount: 610,
    currency: "USD",
    amountLabel: "USD 610",
    displayDescription: FULL,
    bankReference: "198677",
    confirmedByEmail: "daniel@example.com",
    revokedByEmail: null,
    reason: null,
    isDuplicate: false,
    excludedFromOperations: false,
    isNonCommercial: false,
    ...partial,
  };
}

describe("extractObservedPayerNames / frequent concept", () => {
  it("separa nombre observado de la descripción Santander", () => {
    expect(extractObservedPayerNames(FULL)).toEqual(["TSUPRASUR S.A.", "SUPRASUR S.A."]);
    expect(extractFrequentDescriptionConcept(FULL)).toMatch(/CRÉDITO OPERACIÓN EN BANCA DIGITAL/i);
    expect(extractFrequentDescriptionConcept(FULL)).not.toMatch(/SUPRASUR/i);
  });

  it("no usa dump normalizado como alias visible", () => {
    expect(
      looksLikeNormalizedDescriptionDump("operacion en banca digital tsuprasur sa suprasur s a")
    ).toBe(true);
    expect(
      pickVisibleAliasName({
        originalName: null,
        normalizedName: "operacion en banca digital tsuprasur sa suprasur s a",
        displayDescription: FULL,
      })
    ).toBe("TSUPRASUR S.A. / SUPRASUR S.A.");
  });
});

describe("active vs corrections fixtures", () => {
  const active = row({ id: "a1", status: "identified" });
  const revoked = Array.from({ length: 8 }, (_, i) =>
    row({
      id: `r${i}`,
      movementId: `mov-r${i}`,
      status: "revoked",
      amount: 100 + i,
      reason: "bank_simple_reconciliation_reset_20260722",
      revokedAt: "2026-07-22T18:00:00Z",
    })
  );
  const duplicate = row({
    id: "dup",
    status: "identified",
    isDuplicate: true,
    excludedFromOperations: true,
    amount: 999,
  });

  it("resumen cuenta solo la activa; total USD 610; fechas por movement_date", () => {
    const all = [active, ...revoked, duplicate];
    const actives = filterActiveBankingRows(all);
    expect(actives).toHaveLength(1);
    const summary = buildClientBankingSummary(actives);
    expect(summary.activeCount).toBe(1);
    expect(summary.totalUsd).toBe(610);
    expect(summary.firstTransferDate).toBe("2026-07-14");
    expect(summary.lastTransferDate).toBe("2026-07-14");
    expect(summary.confidenceLabel).toBe("Posible");
  });

  it("correcciones agrupa el reset QA; historial activo una fila", () => {
    const corrections = filterCorrectionRows([active, ...revoked, duplicate]);
    expect(corrections).toHaveLength(8);
    const groups = groupCorrections(corrections);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("qa_reset");
    expect(groups[0]!.count).toBe(8);
    expect(groups[0]!.label).toMatch(/Reset de conciliaciones de prueba/);
  });

  it("cómo aparece + forma habitual no listan revocadas", () => {
    const actives = filterActiveBankingRows([active, ...revoked]);
    const how = buildHowAppearsFromActive(actives);
    expect(how.observedNames.join(" / ")).toMatch(/SUPRASUR/i);
    expect(how.frequentDescription).toMatch(/CRÉDITO|BANCA DIGITAL/i);
    const habitual = buildHabitualPaymentPattern(actives, how);
    expect(habitual.movementCount).toBe(1);
    expect(habitual.currency).toBe("USD");
    expect(habitual.statusLabel).toBe("Posible");
  });
});

describe("associationRowFromMovement + consult href", () => {
  it("prioriza movement_date y descripción canónica", () => {
    const built = associationRowFromMovement({
      identification: {
        id: "i1",
        movementId: "m1",
        status: "identified",
        reason: null,
        confirmedAt: "2026-07-23T15:00:00Z",
        revokedAt: null,
        confirmedByEmail: "daniel@example.com",
        revokedByEmail: null,
      },
      movement: {
        movement_date: "2026-07-14",
        amount: 610,
        currency: "USD",
        bank_reference: "198677",
        raw_description: FULL,
        description: "corto",
        created_at: "2026-07-15T00:00:00Z",
        status: "pending",
        excluded_from_operations: false,
        duplicate_of: null,
        metadata: null,
      },
    });
    expect(built.movementDate).toBe("2026-07-14");
    expect(built.associatedAt).toBe("2026-07-23T15:00:00Z");
    expect(built.displayDescription).toBe(FULL);
    expect(built.bankReference).toBe("198677");
    expect(built.amountLabel).toBe("USD 610");
  });

  it("Ver en Banco abre Movimientos en modo consulta", () => {
    const href = buildBankMovementConsultHref({
      movementId: "m1",
      clientReturnTo: "tab=identificacion",
    });
    expect(href).toContain("tab=movimientos");
    expect(href).toContain("movementId=m1");
    expect(href).toContain("view=consult");
    expect(href).toContain("returnTo=");
    expect(href).not.toContain("tab=conciliacion");
  });
});
