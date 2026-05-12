/**
 * Aging real con `due_date` + `due_date_source` (ZETA-08 FASE 7).
 *
 * Verifica que el motor:
 *  - Usa `due_date` REAL cuando `due_date_source === 'zeta_cuotas_v1'`.
 *  - Cae al sintético `now - issue_date` cuando NO hay due real.
 *  - Reporta `agingSource` por moneda (`real` / `synthetic` / `mixed`).
 *  - Cuenta `realDueDateCount` y `syntheticDueDateCount` en cada bucket.
 *  - NUNCA pisa due real con fallback sintético si llega `due_date_source = 'zeta_cuotas_v1'`
 *    pero `due_date` parseable.
 *
 * No depende del resto de las pruebas — usa un setup acotado.
 */
import { describe, expect, it } from "vitest";

import {
  generateFinancialConsistencyReport,
  type InvoiceInput,
} from "./copilot-financial-reconciliation";

const NOW = "2026-05-15T12:00:00.000Z";

function inv(overrides: Partial<InvoiceInput> & { id: string }): InvoiceInput {
  return {
    company_id: "company-1",
    currency_code: "UYU",
    total_amount: 1000,
    balance_amount: 1000,
    status: null,
    updated_at: "2026-05-10T00:00:00.000Z",
    issue_date: "2026-04-01",
    ...overrides,
  };
}

function run(invoices: InvoiceInput[]) {
  return generateFinancialConsistencyReport({
    workspaceId: "ws-1",
    invoices,
    companies: [],
    syncStates: [],
    now: NOW,
  });
}

describe("aging real con due_date (zeta_cuotas_v1)", () => {
  it("clasifica como vigente (0_30) cuando due_date_real > now", () => {
    const report = run([
      inv({
        id: "i1",
        issue_date: "2026-04-01", // 44 días → sintético sería 31_60
        due_date: "2026-06-15", // 31 días en el futuro → vigente
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const uyu = report.agingByCurrency.UYU;
    expect(uyu).toBeDefined();
    const b030 = uyu!.find((b) => b.range === "0_30");
    expect(b030?.amount).toBe(1000);
    expect(b030?.realDueDateCount).toBe(1);
    expect(b030?.syntheticDueDateCount).toBe(0);
    expect(report.currencies.find((c) => c.currencyCode === "UYU")?.agingSource).toBe("real");
  });

  it("vencido entre 0 y 30 días desde due_date real → 0_30", () => {
    const report = run([
      inv({
        id: "i1",
        issue_date: "2026-01-01", // sintético: 90+ días
        due_date: "2026-04-30", // 15 días vencido
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const b030 = report.agingByCurrency.UYU?.find((b) => b.range === "0_30");
    expect(b030?.amount).toBe(1000);
    expect(b030?.realDueDateCount).toBe(1);
  });

  it("vencido 31..60 días desde due_date real → 31_60", () => {
    const report = run([
      inv({
        id: "i1",
        due_date: "2026-03-20", // 56 días vencido
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const b3160 = report.agingByCurrency.UYU?.find((b) => b.range === "31_60");
    expect(b3160?.amount).toBe(1000);
    expect(b3160?.realDueDateCount).toBe(1);
  });

  it("vencido 61..90 días desde due_date real → 61_90", () => {
    const report = run([
      inv({
        id: "i1",
        due_date: "2026-02-20", // 84 días vencido
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const b6190 = report.agingByCurrency.UYU?.find((b) => b.range === "61_90");
    expect(b6190?.amount).toBe(1000);
  });

  it("vencido >90 días desde due_date real → 90_plus", () => {
    const report = run([
      inv({
        id: "i1",
        due_date: "2026-01-01", // 134 días vencido
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const b90 = report.agingByCurrency.UYU?.find((b) => b.range === "90_plus");
    expect(b90?.amount).toBe(1000);
  });
});

describe("fallback sintético cuando no hay due_date real", () => {
  it("usa issue_date cuando due_date_source !== 'zeta_cuotas_v1'", () => {
    const report = run([
      inv({
        id: "i1",
        issue_date: "2026-04-01", // 44 días → 31_60 sintético
        due_date: "2026-06-15", // ignorado: source synthetic
        due_date_source: "synthetic_30d",
      }),
    ]);
    const b3160 = report.agingByCurrency.UYU?.find((b) => b.range === "31_60");
    expect(b3160?.amount).toBe(1000);
    expect(b3160?.syntheticDueDateCount).toBe(1);
    expect(b3160?.realDueDateCount).toBe(0);
    expect(report.currencies.find((c) => c.currencyCode === "UYU")?.agingSource).toBe("synthetic");
  });

  it("usa issue_date cuando due_date_source es null", () => {
    const report = run([
      inv({
        id: "i1",
        issue_date: "2026-01-01", // 134 días → 90_plus sintético
        due_date: null,
        due_date_source: null,
      }),
    ]);
    const b90 = report.agingByCurrency.UYU?.find((b) => b.range === "90_plus");
    expect(b90?.amount).toBe(1000);
    expect(b90?.syntheticDueDateCount).toBe(1);
  });

  it("usa issue_date cuando due_date es null incluso con source = 'zeta_cuotas_v1'", () => {
    // Defensa: si el linkage rompió y dejó source pero NULL en due_date, no
    // se cae — se usa fallback. La migración SQL nunca permite source=v1
    // sin due_date, pero el código debe ser robusto.
    const report = run([
      inv({
        id: "i1",
        issue_date: "2026-02-20", // 84 días → 61_90 sintético
        due_date: null,
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const b6190 = report.agingByCurrency.UYU?.find((b) => b.range === "61_90");
    expect(b6190?.amount).toBe(1000);
    expect(b6190?.syntheticDueDateCount).toBe(1);
  });
});

describe("agingSource mixto y monedas separadas", () => {
  it("agingSource = 'mixed' cuando coexisten real y sintético en la misma moneda", () => {
    const report = run([
      inv({
        id: "i1",
        currency_code: "UYU",
        due_date: "2026-03-20",
        due_date_source: "zeta_cuotas_v1",
      }),
      inv({
        id: "i2",
        currency_code: "UYU",
        issue_date: "2026-02-20",
        due_date: null,
        due_date_source: null,
      }),
    ]);
    expect(report.currencies.find((c) => c.currencyCode === "UYU")?.agingSource).toBe("mixed");
  });

  it("agingSource se computa independiente por moneda", () => {
    const report = run([
      inv({
        id: "i1",
        currency_code: "UYU",
        due_date: "2026-03-20",
        due_date_source: "zeta_cuotas_v1",
      }),
      inv({
        id: "i2",
        currency_code: "USD",
        issue_date: "2026-01-01",
        due_date: null,
        due_date_source: null,
      }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    expect(uyu?.agingSource).toBe("real");
    expect(usd?.agingSource).toBe("synthetic");
  });

  it("agingSource = 'none' cuando no hay pending invoices en la moneda", () => {
    const report = run([
      inv({
        id: "i1",
        currency_code: "UYU",
        balance_amount: 0,
        status: "paid",
        due_date: "2026-03-20",
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    // Si no hay pending, la moneda no aparece (filtered). Si aparece, agingSource = 'none'.
    if (uyu) expect(uyu.agingSource).toBe("none");
  });
});

describe("múltiples cuotas: aging usa la cuota más cercana al vencimiento", () => {
  it("invoice con due_date real correspondiente a la primera cuota pendiente clasifica por esa fecha", () => {
    // El pipeline de cuotas escribe min(cuota_vencimiento) en due_date.
    // Si una factura tiene 3 cuotas (jun, jul, ago) y todas pendientes,
    // due_date queda en jun → vigente (0_30 al 15-may).
    const report = run([
      inv({
        id: "i1",
        due_date: "2026-06-30", // próximo a vencer
        due_date_source: "zeta_cuotas_v1",
      }),
    ]);
    const b030 = report.agingByCurrency.UYU?.find((b) => b.range === "0_30");
    expect(b030?.amount).toBe(1000);
  });
});
