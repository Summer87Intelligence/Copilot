import { describe, expect, it } from "vitest";

import type { DebtorCollectionRow } from "@/lib/copilot-hoy-executive";
import { debtorAgingSortRank, sortDebtorRowsByAging } from "@/lib/hoy-debtor-sort";

function row(partial: Partial<DebtorCollectionRow> & Pick<DebtorCollectionRow, "row_id" | "name">): DebtorCollectionRow {
  return {
    company_id: partial.row_id,
    currency: "UYU",
    deuda: { currency: "UYU", amount: 1000, formatted: "$ 1.000" },
    vencido: null,
    antiguedad: "—",
    motivo: "",
    riesgo: "Bajo",
    accion: "",
    deepLink: "/",
    flags: { hasOverdue: false, slowCollection: false, critical30Share: false },
    ...partial,
  };
}

describe("sortDebtorRowsByAging", () => {
  it("ordena >90, 61-90, 31-60, 0-30, al día", () => {
    const rows = sortDebtorRowsByAging([
      row({ row_id: "a", name: "Al día", flags: { hasOverdue: false, slowCollection: false, critical30Share: false } }),
      row({ row_id: "b", name: "30d", overdueDays: 15, flags: { hasOverdue: true, slowCollection: false, critical30Share: true }, vencido: { currency: "UYU", amount: 100, formatted: "" } }),
      row({ row_id: "c", name: "120d", overdueDays: 120, flags: { hasOverdue: true, slowCollection: false, critical30Share: true }, vencido: { currency: "UYU", amount: 500, formatted: "" } }),
      row({ row_id: "d", name: "45d", overdueDays: 45, flags: { hasOverdue: true, slowCollection: false, critical30Share: true }, vencido: { currency: "UYU", amount: 200, formatted: "" } }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["120d", "45d", "30d", "Al día"]);
  });

  it("debtorAgingSortRank devuelve 5 sin mora", () => {
    expect(debtorAgingSortRank(row({ row_id: "x", name: "X" }))).toBe(5);
  });
});
