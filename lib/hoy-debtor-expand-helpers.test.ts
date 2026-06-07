import { describe, expect, it } from "vitest";
import {
  buildDebtorExpandData,
  fmtDebtSymbol,
} from "@/lib/hoy-debtor-expand-helpers";
import type { DebtorCollectionRow } from "@/lib/copilot-hoy-executive";

// ── Factory ───────────────────────────────────────────────────────────────────

function makeRow(opts: {
  deudaAmt: number;
  vencidoAmt?: number;
  overdueDays?: number;
  currency?: "UYU" | "USD";
}): DebtorCollectionRow {
  const currency = opts.currency ?? "UYU";
  const vencidoAmt = opts.vencidoAmt ?? 0;
  return {
    row_id: "test-row",
    company_id: "company-1",
    name: "Cliente Prueba",
    currency,
    deuda: { amount: opts.deudaAmt, currency, formatted: "" },
    vencido:
      vencidoAmt > 0 ? { amount: vencidoAmt, currency, formatted: "" } : null,
    antiguedad: vencidoAmt > 0 ? ">30d" : "",
    motivo: "",
    riesgo: "Bajo",
    accion: "",
    deepLink: "/copilot/clientes/company-1",
    overdueDays: opts.overdueDays ?? null,
    flags: {
      hasOverdue: vencidoAmt > 0,
      slowCollection: false,
      critical30Share: vencidoAmt > 0,
    },
  };
}

// ── buildDebtorExpandData ─────────────────────────────────────────────────────

describe("buildDebtorExpandData — deuda total con vencida parcial", () => {
  const row = makeRow({ deudaAmt: 25742, vencidoAmt: 17080, overdueDays: 21 });
  const data = buildDebtorExpandData(row);

  it("deudaTotalAmt coincide con deuda del row", () => {
    expect(data.deudaTotalAmt).toBe(25742);
  });

  it("deudaVencidaAmt coincide con vencido del row", () => {
    expect(data.deudaVencidaAmt).toBe(17080);
  });

  it("deudaAlDia = deudaTotal − deudaVencida", () => {
    expect(data.deudaAlDia).toBe(25742 - 17080); // 8662
  });

  it("hasOverdue es true", () => {
    expect(data.hasOverdue).toBe(true);
  });

  it("overdueDays refleja los días reales", () => {
    expect(data.overdueDays).toBe(21);
  });

  it("expandMessage indica seguimiento por deuda vencida", () => {
    expect(data.expandMessage).toMatch(/seguimiento/i);
    expect(data.expandMessage).toMatch(/vencida/i);
  });

  it("accionSugerida pide contactar por deuda vencida", () => {
    expect(data.accionSugerida).toMatch(/contactar/i);
  });
});

describe("buildDebtorExpandData — deuda sin vencida (al día)", () => {
  const row = makeRow({ deudaAmt: 8662, vencidoAmt: 0 });
  const data = buildDebtorExpandData(row);

  it("deudaVencidaAmt es null cuando no hay vencimiento", () => {
    expect(data.deudaVencidaAmt).toBeNull();
  });

  it("deudaAlDia coincide con toda la deuda", () => {
    expect(data.deudaAlDia).toBe(8662);
  });

  it("hasOverdue es false", () => {
    expect(data.hasOverdue).toBe(false);
  });

  it("overdueDays es null", () => {
    expect(data.overdueDays).toBeNull();
  });

  it("expandMessage menciona que todavía no venció", () => {
    expect(data.expandMessage).toMatch(/no venció/i);
  });

  it("accionSugerida es preventiva", () => {
    expect(data.accionSugerida).toMatch(/preventiv/i);
  });
});

describe("buildDebtorExpandData — días de atraso", () => {
  it("overdueDays se expone cuando hay vencida y días > 0", () => {
    const row = makeRow({ deudaAmt: 10000, vencidoAmt: 10000, overdueDays: 45 });
    expect(buildDebtorExpandData(row).overdueDays).toBe(45);
  });

  it("overdueDays es null cuando hay vencida pero overdueDays = 0", () => {
    const row = makeRow({ deudaAmt: 10000, vencidoAmt: 5000, overdueDays: 0 });
    expect(buildDebtorExpandData(row).overdueDays).toBeNull();
  });

  it("overdueDays es null cuando no hay vencida aunque se pasen días", () => {
    const row = makeRow({ deudaAmt: 10000, vencidoAmt: 0, overdueDays: 30 });
    expect(buildDebtorExpandData(row).overdueDays).toBeNull();
  });
});

describe("buildDebtorExpandData — deuda vencida = deuda total (todo vencido)", () => {
  const row = makeRow({ deudaAmt: 5000, vencidoAmt: 5000, overdueDays: 90 });
  const data = buildDebtorExpandData(row);

  it("deudaAlDia es 0", () => {
    expect(data.deudaAlDia).toBe(0);
  });

  it("hasOverdue es true", () => {
    expect(data.hasOverdue).toBe(true);
  });
});

describe("buildDebtorExpandData — moneda USD", () => {
  it("currency USD se propaga correctamente", () => {
    const row = makeRow({ deudaAmt: 1500, vencidoAmt: 500, currency: "USD" });
    const data = buildDebtorExpandData(row);
    expect(data.currency).toBe("USD");
    expect(data.deudaAlDia).toBe(1000);
  });
});

// ── fmtDebtSymbol ─────────────────────────────────────────────────────────────

describe("fmtDebtSymbol", () => {
  it("UYU → símbolo $", () => {
    expect(fmtDebtSymbol(25742, "UYU")).toBe("$ 25.742");
  });

  it("USD → símbolo U$S", () => {
    expect(fmtDebtSymbol(1500, "USD")).toBe("U$S 1.500");
  });

  it("formatea con separador de miles", () => {
    const result = fmtDebtSymbol(100000, "UYU");
    expect(result).toMatch(/100/);
  });
});
