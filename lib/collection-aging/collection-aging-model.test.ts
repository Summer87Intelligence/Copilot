import { describe, it, expect } from "vitest";

import {
  classifyClientByWorstInvoice,
  classifyInvoiceByIssueDate,
  COLLECTION_AGING_BUCKETS,
  COLLECTION_AGING_BUCKET_ORDER,
  getDaysSinceIssue,
  isInvoiceOverdueByCollectionModel,
  type CollectionAgingBucket,
} from "./collection-aging-model";

const REF = "2026-02-01"; // fecha de referencia fija para todos los tests

/** issue_date que cae exactamente a N días de REF (REF − N días). */
function issueAtDays(n: number): string {
  const refMs = Date.parse(`${REF}T12:00:00.000Z`);
  const d = new Date(refMs - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe("getDaysSinceIssue", () => {
  it("emisión hoy = día 0", () => {
    expect(getDaysSinceIssue(REF, REF)).toBe(0);
  });

  it("cuenta días enteros desde emisión", () => {
    expect(getDaysSinceIssue(issueAtDays(10), REF)).toBe(10);
    expect(getDaysSinceIssue(issueAtDays(31), REF)).toBe(31);
  });

  it("acepta ISO con hora (toma prefijo de fecha)", () => {
    expect(getDaysSinceIssue("2026-01-25T09:30:00Z", REF)).toBe(7);
  });

  it("fecha inválida ⇒ NaN", () => {
    expect(Number.isNaN(getDaysSinceIssue("no-es-fecha", REF))).toBe(true);
    expect(Number.isNaN(getDaysSinceIssue("", REF))).toBe(true);
  });

  it("fecha futura ⇒ negativo", () => {
    expect(getDaysSinceIssue(issueAtDays(-5), REF)).toBe(-5);
  });
});

describe("classifyInvoiceByIssueDate — bordes de bucket", () => {
  const cases: Array<[number, CollectionAgingBucket]> = [
    [0, "not_overdue"],
    [7, "not_overdue"],
    [8, "overdue_8_14"],
    [14, "overdue_8_14"],
    [15, "overdue_15_30"],
    [30, "overdue_15_30"],
    [31, "overdue_30_plus"],
    [400, "overdue_30_plus"],
  ];

  for (const [days, bucket] of cases) {
    it(`${days} días ⇒ ${bucket}`, () => {
      const c = classifyInvoiceByIssueDate(issueAtDays(days), REF);
      expect(c.bucket).toBe(bucket);
      expect(c.daysSinceIssue).toBe(days);
    });
  }

  it("día 7 NO está atrasado; día 8 SÍ", () => {
    expect(isInvoiceOverdueByCollectionModel(issueAtDays(7), REF)).toBe(false);
    expect(isInvoiceOverdueByCollectionModel(issueAtDays(8), REF)).toBe(true);
  });
});

describe("classifyInvoiceByIssueDate — labels y tonos", () => {
  it("not_overdue ⇒ neutral / 'No atrasado'", () => {
    const c = classifyInvoiceByIssueDate(issueAtDays(3), REF);
    expect(c.label).toBe("No atrasado");
    expect(c.shortLabel).toBe("No atrasado");
    expect(c.tone).toBe("neutral");
    expect(c.isOverdue).toBe(false);
    expect(c.sortRank).toBe(0);
  });

  it("overdue_8_14 ⇒ success (verde suave)", () => {
    const c = classifyInvoiceByIssueDate(issueAtDays(10), REF);
    expect(c.label).toBe("Atrasado 8–14 días");
    expect(c.tone).toBe("success");
    expect(c.sortRank).toBe(1);
  });

  it("overdue_15_30 ⇒ warning (ámbar)", () => {
    const c = classifyInvoiceByIssueDate(issueAtDays(20), REF);
    expect(c.label).toBe("Atrasado 15–30 días");
    expect(c.tone).toBe("warning");
    expect(c.sortRank).toBe(2);
  });

  it("overdue_30_plus ⇒ danger (rojo)", () => {
    const c = classifyInvoiceByIssueDate(issueAtDays(45), REF);
    expect(c.label).toBe("Atrasado +30 días");
    expect(c.tone).toBe("danger");
    expect(c.sortRank).toBe(3);
  });
});

describe("classifyInvoiceByIssueDate — entradas degeneradas", () => {
  it("fecha inválida ⇒ not_overdue con 0 días (conservador)", () => {
    const c = classifyInvoiceByIssueDate("xxxx", REF);
    expect(c.bucket).toBe("not_overdue");
    expect(c.daysSinceIssue).toBe(0);
  });

  it("fecha futura ⇒ not_overdue con 0 días", () => {
    const c = classifyInvoiceByIssueDate(issueAtDays(-10), REF);
    expect(c.bucket).toBe("not_overdue");
    expect(c.daysSinceIssue).toBe(0);
  });

  it("acepta objeto Date", () => {
    const d = new Date(Date.parse(`${issueAtDays(20)}T12:00:00.000Z`));
    expect(classifyInvoiceByIssueDate(d, REF).bucket).toBe("overdue_15_30");
  });
});

describe("classifyClientByWorstInvoice — peor estado gana", () => {
  it("toma la factura con más días de atraso", () => {
    const c = classifyClientByWorstInvoice(
      [
        { issue_date: issueAtDays(3), pendingAmount: 100 },
        { issue_date: issueAtDays(45), pendingAmount: 50 },
        { issue_date: issueAtDays(20), pendingAmount: 10 },
      ],
      REF
    );
    expect(c.bucket).toBe("overdue_30_plus");
    expect(c.daysSinceIssue).toBe(45);
  });

  it("cliente con una factura no atrasada y otra +30 ⇒ +30 (peor)", () => {
    const c = classifyClientByWorstInvoice(
      [
        { issue_date: issueAtDays(2), pendingAmount: 1000 },
        { issue_date: issueAtDays(60), pendingAmount: 1 },
      ],
      REF
    );
    expect(c.bucket).toBe("overdue_30_plus");
  });

  it("ignora facturas con pendingAmount <= 0", () => {
    const c = classifyClientByWorstInvoice(
      [
        { issue_date: issueAtDays(90), pendingAmount: 0 },
        { issue_date: issueAtDays(5), pendingAmount: 200 },
      ],
      REF
    );
    expect(c.bucket).toBe("not_overdue");
  });

  it("incluye facturas sin pendingAmount informado", () => {
    const c = classifyClientByWorstInvoice(
      [{ issueDate: issueAtDays(18) }],
      REF
    );
    expect(c.bucket).toBe("overdue_15_30");
  });

  it("sin facturas ⇒ not_overdue", () => {
    expect(classifyClientByWorstInvoice([], REF).bucket).toBe("not_overdue");
  });

  it("facturas abiertas sin fecha parseable ⇒ not_overdue (0 días)", () => {
    const c = classifyClientByWorstInvoice(
      [{ issue_date: null, pendingAmount: 500 }],
      REF
    );
    expect(c.bucket).toBe("not_overdue");
    expect(c.daysSinceIssue).toBe(0);
  });
});

describe("tabla canónica de buckets", () => {
  it("orden de severidad consistente con sortRank", () => {
    const ranks = COLLECTION_AGING_BUCKET_ORDER.map(
      (b) => COLLECTION_AGING_BUCKETS[b].sortRank
    );
    expect(ranks).toEqual([0, 1, 2, 3]);
  });

  it("solo not_overdue no es atrasado", () => {
    for (const b of COLLECTION_AGING_BUCKET_ORDER) {
      const overdue = b !== "not_overdue";
      expect(classifyInvoiceByIssueDate(issueAtDays(daysForBucket(b)), REF).isOverdue).toBe(
        overdue
      );
    }
  });
});

function daysForBucket(b: CollectionAgingBucket): number {
  switch (b) {
    case "not_overdue":
      return 3;
    case "overdue_8_14":
      return 10;
    case "overdue_15_30":
      return 20;
    case "overdue_30_plus":
      return 45;
  }
}
