import { describe, it, expect } from "vitest";

import type { DebtorCollectionRow } from "@/lib/copilot-today-business-pulse";
import {
  debtorHasOverdueAmount,
  debtorRiskBadge,
  formatDebtorDaysCell,
} from "@/lib/hoy-debtor-cell-format";

function row(o: {
  currency: "UYU" | "USD";
  deuda: number;
  vencido?: number | null;
  overdueDays?: number | null;
  antiguedad?: string;
  hasOverdue?: boolean;
  critical30Share?: boolean;
}): DebtorCollectionRow {
  return {
    currency: o.currency,
    deuda: { amount: o.deuda, currency: o.currency },
    vencido: o.vencido != null ? { amount: o.vencido, currency: o.currency } : null,
    overdueDays: o.overdueDays ?? null,
    antiguedad: o.antiguedad ?? "",
    flags: { hasOverdue: o.hasOverdue ?? false, critical30Share: o.critical30Share ?? false },
  } as unknown as DebtorCollectionRow;
}

describe("debtor cell format — Casos de negocio de Hoy", () => {
  it("Caso 1 — todo atrasado (USD 1049, 151 días): muestra atrasado y días", () => {
    const r = row({ currency: "USD", deuda: 1049, vencido: 1049, overdueDays: 151, hasOverdue: true });
    expect(debtorHasOverdueAmount(r)).toBe(true);
    expect(formatDebtorDaysCell(r)).toBe("151 días");
    expect(debtorRiskBadge(r)).toBe("atrasado");
  });

  it("Caso 2 — sin atraso: Atrasado = '—', días = '—', sin badge Atrasado", () => {
    const r = row({ currency: "UYU", deuda: 30640, vencido: null, hasOverdue: false });
    expect(debtorHasOverdueAmount(r)).toBe(false);
    expect(formatDebtorDaysCell(r)).toBe("—");
    expect(debtorRiskBadge(r)).toBe("con-deuda");
  });

  it("Caso 3 — atraso parcial (UYU deuda 30640 / atrasado 15320 / 13 días)", () => {
    const r = row({ currency: "UYU", deuda: 30640, vencido: 15320, overdueDays: 13, hasOverdue: true });
    expect(debtorHasOverdueAmount(r)).toBe(true);
    expect(formatDebtorDaysCell(r)).toBe("13 días");
    expect(debtorRiskBadge(r)).toBe("atrasado");
    // El importe atrasado (15320) es menor que la deuda total (30640): atraso parcial.
    expect(r.vencido!.amount).toBeLessThan(r.deuda.amount);
  });

  it("hasOverdue sin días > 0 cae a antigüedad", () => {
    const r = row({ currency: "UYU", deuda: 100, vencido: 100, overdueDays: 0, antiguedad: "reciente", hasOverdue: true });
    expect(formatDebtorDaysCell(r)).toBe("reciente");
  });

  it("crítico +30 sin atrasado explícito → badge critico (nunca 'vencido')", () => {
    const r = row({ currency: "USD", deuda: 500, vencido: null, hasOverdue: false, critical30Share: true });
    expect(debtorRiskBadge(r)).toBe("critico");
  });

  it("UYU y USD son independientes (no se mezclan monedas)", () => {
    const uyu = row({ currency: "UYU", deuda: 1000, vencido: 1000, overdueDays: 5, hasOverdue: true });
    const usd = row({ currency: "USD", deuda: 1000, vencido: 1000, overdueDays: 5, hasOverdue: true });
    expect(uyu.deuda.currency).toBe("UYU");
    expect(usd.deuda.currency).toBe("USD");
  });
});
