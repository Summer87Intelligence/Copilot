import { describe, expect, it } from "vitest";

import {
  addDaysYmd,
  alertsInput,
  bankInputFromReconMeta,
  portfolioInputs,
  splitTreasuryPayments,
} from "@/lib/daily-tasks/daily-tasks-sources";

describe("bankInputFromReconMeta", () => {
  it("deriva withSuggestion y low correctamente", () => {
    const r = bankInputFromReconMeta({
      pending_count: 6,
      with_high_confidence: 3,
      with_medium_confidence: 1,
      without_suggestions: 1,
    });
    expect(r.pending).toBe(6);
    expect(r.withSuggestion).toBe(5); // 6 - 1 sin sugerencia
    expect(r.high).toBe(3);
    expect(r.medium).toBe(1);
    expect(r.low).toBe(1); // 5 - 3 - 1
  });

  it("meta ausente ⇒ ceros", () => {
    expect(bankInputFromReconMeta(null)).toEqual({
      withSuggestion: 0,
      high: 0,
      medium: 0,
      low: 0,
      pending: 0,
    });
  });
});

describe("splitTreasuryPayments", () => {
  it("separa vencen hoy de próximos y descarta pagados/cancelados", () => {
    const { due, upcoming } = splitTreasuryPayments(
      [
        { name: "DGI", amount: 100, currency: "UYU", dueDate: "2026-07-10", status: "scheduled" },
        { name: "BPS", amount: 200, currency: "UYU", dueDate: "2026-07-12", status: "scheduled" },
        { name: "Viejo", amount: 5, currency: "UYU", dueDate: "2026-07-01", status: "overdue" },
        { name: "Pagado", amount: 5, currency: "UYU", dueDate: "2026-07-10", status: "paid" },
        { name: "Lejano", amount: 5, currency: "UYU", dueDate: "2026-07-30", status: "scheduled" },
      ],
      "2026-07-10",
      3
    );
    expect(due.map((d) => d.name)).toEqual(["DGI"]);
    expect(upcoming.map((d) => d.name)).toEqual(["BPS"]);
  });
});

describe("portfolioInputs", () => {
  it("arma clientes vencidos ordenados, totales por moneda y críticos", () => {
    const r = portfolioInputs([
      { name: "Acme", overdue_uyu: 1000, overdue_usd: 0, risk: "Alto" },
      { name: "Globex", overdue_uyu: 5000, overdue_usd: 100, risk: "Medio" },
      { name: "Sin deuda", overdue_debt: 0, risk: "Bajo" },
    ]);
    expect(r.overdueClients.map((c) => c.name)).toEqual(["Globex", "Acme"]);
    expect(r.overdueByCurrency).toEqual([
      { currency: "UYU", amount: 6000 },
      { currency: "USD", amount: 100 },
    ]);
    expect(r.criticalClients.map((c) => c.name)).toEqual(["Acme"]);
  });
});

describe("alertsInput", () => {
  it("cuenta activas y críticas solo entre no leídas", () => {
    const r = alertsInput([
      { severity: "critical", read_at: null },
      { severity: "warning", read_at: null },
      { severity: "info", read_at: null },
      { severity: "critical", read_at: "2026-07-10T00:00:00Z" },
    ]);
    expect(r.active).toBe(2);
    expect(r.critical).toBe(1);
  });
});

describe("addDaysYmd", () => {
  it("suma días", () => {
    expect(addDaysYmd("2026-07-10", 3)).toBe("2026-07-13");
  });
});
