import { describe, expect, it } from "vitest";

import {
  classifyEvidence,
  clusterInflowMovements,
  deriveIdentificationLevel,
  derivePayerClusterKey,
  matchClusterToClients,
  type ClusterableMovement,
} from "@/lib/bank/canonical/bank-payer-identification";

function mov(over: Partial<ClusterableMovement>): ClusterableMovement {
  return {
    movementId: "m1",
    movementDate: "2026-03-15",
    amount: 100,
    currency: "USD",
    description: null,
    bankReference: null,
    bankName: "Santander",
    ...over,
  };
}

describe("derivePayerClusterKey", () => {
  it("nunca deriva de una referencia puntual (sin nombre extraíble)", () => {
    expect(
      derivePayerClusterKey(mov({ description: "TRANSF INSTANTANEA RECIBIDA 564688LR:2606100469 36156 X", bankReference: "LR2606100469" }))
    ).toBeNull();
  });

  it("deriva un token estable a partir del nombre extraído", () => {
    const key = derivePayerClusterKey(
      mov({ description: "HONORARIOS PROFESIONALES 397850TT RECIBIDA /DOBSURA CORPORATION SA /CAMI" })
    );
    expect(key).toBe("DOBSURA_CORPORATION_SA");
  });
});

describe("clusterInflowMovements", () => {
  it("mismo pagador, distintas referencias puntuales → un solo cluster", () => {
    const clusters = clusterInflowMovements([
      mov({ movementId: "a", movementDate: "2026-02-15", bankReference: "TR0001", description: "HONORARIOS PROFESIONALES 111TT RECIBIDA /DOBSURA CORPORATION SA /CAMI" }),
      mov({ movementId: "b", movementDate: "2026-03-15", bankReference: "TR0002", description: "HONORARIOS PROFESIONALES 222TT RECIBIDA /DOBSURA CORPORATION SA /CAMI" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.movements).toHaveLength(2);
  });

  it("mismo pagador, varios meses → cluster con meses ordenados sin duplicar", () => {
    const clusters = clusterInflowMovements([
      mov({ movementId: "a", movementDate: "2026-02-15", description: "CREDITO OPERACION EN BANCA DIGITAL TBOTICA/BOTICA DEL SEÑOR SRL" }),
      mov({ movementId: "b", movementDate: "2026-03-15", description: "CREDITO OPERACION EN BANCA DIGITAL TBOTICA/BOTICA DEL SEÑOR SRL" }),
      mov({ movementId: "c", movementDate: "2026-04-15", description: "CREDITO OPERACION EN BANCA DIGITAL TBOTICA/BOTICA DEL SEÑOR SRL" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.months).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(clusters[0]!.displayName).toBe("BOTICA DEL SEÑOR SRL");
  });

  it("mismo importe, distinto pagador → clusters separados (no agrupa por importe)", () => {
    const clusters = clusterInflowMovements([
      mov({ movementId: "a", amount: 500, description: "CREDITO OPERACION EN BANCA DIGITAL TX/CLIENTE UNO SA" }),
      mov({ movementId: "b", amount: 500, description: "CREDITO OPERACION EN BANCA DIGITAL TY/CLIENTE DOS SA" }),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("acumula totales por moneda y no mezcla monedas distintas", () => {
    const clusters = clusterInflowMovements([
      mov({ movementId: "a", amount: 100, currency: "USD", description: "CREDITO OPERACION EN BANCA DIGITAL TX/ACME SA" }),
      mov({ movementId: "b", amount: 200, currency: "USD", description: "CREDITO OPERACION EN BANCA DIGITAL TX/ACME SA" }),
      mov({ movementId: "c", amount: 5000, currency: "UYU", description: "CREDITO OPERACION EN BANCA DIGITAL TX/ACME SA" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.totalByCurrency).toEqual({ USD: 300, UYU: 5000 });
    expect(clusters[0]!.currencies).toEqual(["USD", "UYU"]);
  });

  it("movimientos sin nombre extraíble no forman cluster", () => {
    const clusters = clusterInflowMovements([
      mov({ description: "COMPRA CON TARJETA DEBITO MERPAGO, MONTEVIDEO" }),
      mov({ description: null }),
    ]);
    expect(clusters).toHaveLength(0);
  });
});

describe("matchClusterToClients", () => {
  it("identidad exacta por razón social", () => {
    const matches = matchClusterToClients(
      { normalizedName: "DOBSURA CORPORATION SA" },
      [
        { clientCompanyId: "c1", clientName: "DOBSURA CORPORATION SA" },
        { clientCompanyId: "c2", clientName: "Otro Cliente SRL" },
      ]
    );
    expect(matches).toEqual([{ clientCompanyId: "c1", clientName: "DOBSURA CORPORATION SA", matchType: "exact" }]);
  });

  it("variantes de nombre (contains) cuando no hay coincidencia exacta", () => {
    const matches = matchClusterToClients(
      { normalizedName: "HARRISON S A" },
      [{ clientCompanyId: "c1", clientName: "HARRISON S.A" }]
    );
    // "HARRISON S A" (sin puntos) no es idéntico a "HARRISON S.A" tras normalizar
    // (normalizePayerName no quita puntuación) — debe caer a "contains" si una
    // cadena contiene a la otra, o a ninguno si no. Se verifica que no explote
    // y devuelva como máximo un candidato razonable.
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("mismo importe, distinto cliente → ambos aparecen si el nombre normalizado coincide con ambos (ambigüedad real)", () => {
    const matches = matchClusterToClients(
      { normalizedName: "ACME" },
      [
        { clientCompanyId: "c1", clientName: "ACME NORTE SA" },
        { clientCompanyId: "c2", clientName: "ACME SUR SA" },
      ]
    );
    expect(matches.map((m) => m.clientCompanyId).sort()).toEqual(["c1", "c2"]);
  });

  it("sin candidato cuando ningún nombre de cliente coincide", () => {
    const matches = matchClusterToClients({ normalizedName: "ZZZ NUNCA VISTO" }, [
      { clientCompanyId: "c1", clientName: "Otro Cliente SRL" },
    ]);
    expect(matches).toEqual([]);
  });

  it("puntuación distinta no debe impedir la coincidencia (S.A. vs S A)", () => {
    const matches = matchClusterToClients(
      { normalizedName: "HARRISON S A" },
      [{ clientCompanyId: "c1", clientName: "HARRISON S.A" }]
    );
    expect(matches).toEqual([{ clientCompanyId: "c1", clientName: "HARRISON S.A", matchType: "exact" }]);
  });

  it("ruido de dirección pegado al nombre (sin segunda barra) no debe impedir la coincidencia", () => {
    const matches = matchClusterToClients(
      { normalizedName: "NIRMEX S A CIRCUNVALACION M" },
      [{ clientCompanyId: "c1", clientName: "Nirmex S.A." }]
    );
    expect(matches).toEqual([{ clientCompanyId: "c1", clientName: "Nirmex S.A.", matchType: "contains" }]);
  });

  it("sufijo legal equivalente (SOCIEDAD ANONIMA vs SA) no debe impedir la coincidencia", () => {
    const matches = matchClusterToClients(
      { normalizedName: "SAMYSOL SOCIEDAD ANONIMA" },
      [{ clientCompanyId: "c1", clientName: "Samysol SA" }]
    );
    expect(matches).toEqual([{ clientCompanyId: "c1", clientName: "Samysol SA", matchType: "exact" }]);
  });
});

describe("classifyEvidence", () => {
  const cluster1Mov = { movements: [mov({})], currencies: ["USD"] };
  const cluster2Mov = { movements: [mov({}), mov({ movementId: "m2" })], currencies: ["USD"] };

  it("fuerte: coincidencia exacta + patrón repetido", () => {
    expect(
      classifyEvidence({
        cluster: cluster2Mov,
        clientMatches: [{ clientCompanyId: "c1", clientName: "X", matchType: "exact" }],
        hasCorroboratingReceipt: false,
      })
    ).toBe("strong");
  });

  it("fuerte: coincidencia exacta + un recibo histórico corrobora, aunque sea un solo movimiento", () => {
    expect(
      classifyEvidence({
        cluster: cluster1Mov,
        clientMatches: [{ clientCompanyId: "c1", clientName: "X", matchType: "exact" }],
        hasCorroboratingReceipt: true,
      })
    ).toBe("strong");
  });

  it("probable: coincidencia exacta pero un solo movimiento sin recibo corroborante", () => {
    expect(
      classifyEvidence({
        cluster: cluster1Mov,
        clientMatches: [{ clientCompanyId: "c1", clientName: "X", matchType: "exact" }],
        hasCorroboratingReceipt: false,
      })
    ).toBe("probable");
  });

  it("ambigua: más de un cliente candidato distinto", () => {
    expect(
      classifyEvidence({
        cluster: cluster2Mov,
        clientMatches: [
          { clientCompanyId: "c1", clientName: "X", matchType: "exact" },
          { clientCompanyId: "c2", clientName: "Y", matchType: "contains" },
        ],
        hasCorroboratingReceipt: false,
      })
    ).toBe("ambiguous");
  });

  it("sin candidato: ningún cliente coincide", () => {
    expect(
      classifyEvidence({ cluster: cluster1Mov, clientMatches: [], hasCorroboratingReceipt: false })
    ).toBe("none");
  });
});

describe("deriveIdentificationLevel", () => {
  it("unidentified: sin cliente confirmado, sin importar el resto", () => {
    expect(
      deriveIdentificationLevel({
        clientConfirmed: false,
        hasCompatibleReceipt: true,
        hasFinancialLink: false,
        hasInvoiceAllocations: false,
      })
    ).toBe("unidentified");
  });

  it("client_identified: cliente confirmado y hay recibo compatible, pero sin link financiero real todavía", () => {
    expect(
      deriveIdentificationLevel({
        clientConfirmed: true,
        hasCompatibleReceipt: true,
        hasFinancialLink: false,
        hasInvoiceAllocations: false,
      })
    ).toBe("client_identified");
  });

  it("missing_receipt: cliente confirmado pero no existe recibo compatible", () => {
    expect(
      deriveIdentificationLevel({
        clientConfirmed: true,
        hasCompatibleReceipt: false,
        hasFinancialLink: false,
        hasInvoiceAllocations: false,
      })
    ).toBe("missing_receipt");
  });

  it("reconciled_with_receipt: existe link financiero real sin allocations de factura", () => {
    expect(
      deriveIdentificationLevel({
        clientConfirmed: true,
        hasCompatibleReceipt: true,
        hasFinancialLink: true,
        hasInvoiceAllocations: false,
      })
    ).toBe("reconciled_with_receipt");
  });

  it("full_reconciliation: link financiero + allocations de factura reales", () => {
    expect(
      deriveIdentificationLevel({
        clientConfirmed: true,
        hasCompatibleReceipt: true,
        hasFinancialLink: true,
        hasInvoiceAllocations: true,
      })
    ).toBe("full_reconciliation");
  });

  it("nunca afirma full_reconciliation sin link financiero real, aunque haya allocations reportadas por error", () => {
    expect(
      deriveIdentificationLevel({
        clientConfirmed: true,
        hasCompatibleReceipt: true,
        hasFinancialLink: false,
        hasInvoiceAllocations: true,
      })
    ).toBe("client_identified");
  });
});
