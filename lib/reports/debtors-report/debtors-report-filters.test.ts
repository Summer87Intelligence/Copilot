import { describe, expect, it } from "vitest";

import { describeActiveDebtorsReportFilters } from "./debtors-report-filters";
import { DEFAULT_DEBTORS_REPORT_FILTERS } from "./debtors-report-types";

describe("describeActiveDebtorsReportFilters", () => {
  it("no incluye filtros default", () => {
    expect(describeActiveDebtorsReportFilters(DEFAULT_DEBTORS_REPORT_FILTERS)).toEqual([]);
  });

  it("incluye solo filtros activos", () => {
    const labels = describeActiveDebtorsReportFilters({
      ...DEFAULT_DEBTORS_REPORT_FILTERS,
      currency: "USD",
      status: "overdue",
      minUyu: 20000,
      overdueDays: "30",
      contact: "with_contact",
    });
    expect(labels).toContain("Moneda: solo dólares");
    expect(labels).toContain("Estado: solo atrasados");
    expect(labels).toContain("Mínimo UYU: $ 20.000");
    expect(labels).toContain("Antigüedad: atrasados más de 30 días");
    expect(labels).toContain("Contacto: con WhatsApp o email");
    expect(labels).not.toContain("Moneda: todas");
    expect(labels).not.toContain("Estado: todos con deuda");
    expect(labels).not.toContain("Contacto: todos");
  });
});
