import { describe, expect, it } from "vitest";

import {
  computeHeuristicSaldoProtoScore,
  extractSerieNumeroFromSaldoSourceRow,
  HEURISTIC_THRESHOLD_ACCEPT,
  parseCcV1SerieNumeroFromInvoiceNumber,
} from "@/lib/integrations/zeta/zeta-saldos-heuristic-match";

describe("zeta-saldos-heuristic-match", () => {
  it("parseCcV1SerieNumeroFromInvoiceNumber — caso ZETA:CCV1:0:182:A:2705", () => {
    const sn = parseCcV1SerieNumeroFromInvoiceNumber("ZETA:CCV1:0:182:A:2705");
    expect(sn).toEqual({ serie: "A", numero: "2705" });
  });

  it("extractSerieNumeroFromSaldoSourceRow lee Serie/Numero con casing mixto", () => {
    expect(
      extractSerieNumeroFromSaldoSourceRow({
        Serie: "A",
        Numero: "2705",
      })
    ).toEqual({ serie: "A", numero: "2705" });
  });

  it("computeHeuristicSaldoProtoScore — 100 puntos cuando coinciden los cuatro criterios (caso 182 A 2705)", () => {
    const proto = {
      id: "inv-1",
      invoice_number: "ZETA:CCV1:0:182:A:2705",
      issue_date: "2026-01-10",
      total_amount: 1000,
      zeta_metadata: {},
    };
    const { score, breakdown } = computeHeuristicSaldoProtoScore(
      {
        serie: "A",
        numero: "2705",
        issueYmd: "2026-01-11",
        totalAmount: 1000,
      },
      proto
    );
    expect(score).toBe(100);
    expect(breakdown).toEqual({
      numero_match: true,
      serie_match: true,
      total_match: true,
      fecha_match: true,
    });
  });

  it("computeHeuristicSaldoProtoScore — 70 solo serie+numero (duda 60–79)", () => {
    const proto = {
      id: "inv-2",
      invoice_number: "ZETA:CCV1:0:182:B:9999",
      issue_date: "2020-01-01",
      total_amount: 1,
      zeta_metadata: {},
    };
    const { score } = computeHeuristicSaldoProtoScore(
      {
        serie: "B",
        numero: "9999",
        issueYmd: "2026-06-01",
        totalAmount: 99999,
      },
      proto
    );
    expect(score).toBe(70);
    expect(score).toBeLessThan(HEURISTIC_THRESHOLD_ACCEPT);
  });
});
