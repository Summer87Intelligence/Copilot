/**
 * Tests del guardrail anti-sombras en `generateFinancialConsistencyReport`.
 *
 * Caso de origen: junio 2026 — el pipeline `zeta-saldos-pipeline` insertó
 * filas sombra `ZETA:{RegistroId}` con `category = 'Zeta / saldos pendientes'`
 * que duplicaban facturas CCV1 ya persistidas. Como resultado, `issuedInPeriod`
 * y `issuedInPeriodNet` se inflaron al doble en `/copilot/cartera` y
 * `/copilot/finanzas`.
 *
 * Reglas que estos tests blindan:
 *
 *  1. Cuando coexisten CCV1 + sombra (mismo company / moneda / fecha / total ±
 *     0.20) la venta cuenta UNA sola vez.
 *  2. La sombra se descarta del cálculo aunque tenga `status='paid'` y la CCV1
 *     siga `issued` (caso real Aldiesan SRL UYU 68.320).
 *  3. NC del período (CFETipo=112) sigue restando del neto correctamente.
 *  4. Una sombra sin CCV1 equivalente sigue contando (no es duplicado).
 *  5. El conteo `shadowDuplicatesSkipped` queda expuesto en el reporte.
 *  6. Una NOSER CFE=0 sin par DGI no se dedupea (no es sombra del saldos
 *     pipeline; convive con CCV1 estándar solo si hay DGI normal en el mismo
 *     día — esa duplicación se resuelve en la migración, no en el motor).
 */

import { describe, expect, it } from "vitest";
import {
  generateFinancialConsistencyReport,
  type InvoiceInput,
} from "./copilot-financial-reconciliation";

const NOW = "2026-06-12T12:00:00.000Z";

function baseInv(overrides: Partial<InvoiceInput> & { id: string; invoice_number: string }): InvoiceInput {
  return {
    company_id: "company-aldiesan",
    currency_code: "UYU",
    total_amount: 1000,
    balance_amount: 1000,
    status: "issued",
    issue_date: "2026-06-04",
    updated_at: NOW,
    category: null,
    ...overrides,
  };
}

function runPeriod(invoices: InvoiceInput[]) {
  return generateFinancialConsistencyReport({
    workspaceId: "ws-1",
    invoices,
    companies: [],
    syncStates: [],
    now: NOW,
    mode: "period_only",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-12",
  });
}

describe("guardrail anti-sombras Zeta / saldos pendientes", () => {
  it("descarta la sombra cuando convive con una CCV1 activa equivalente (mismo total exacto)", () => {
    const ccv1 = baseInv({
      id: "ccv1-1",
      invoice_number: "ZETA:CCV1:0:33:A:2944",
      total_amount: 530.70,
      balance_amount: 530.70,
      status: "issued",
      category: "Zeta / comprobantes por cliente",
      currency_code: "USD",
      company_id: "company-dobsura",
    });
    const shadow = baseInv({
      id: "shadow-1",
      invoice_number: "ZETA:2748",
      total_amount: 530.70,
      balance_amount: 0,
      status: "paid",
      category: "Zeta / saldos pendientes",
      currency_code: "USD",
      company_id: "company-dobsura",
    });

    const report = runPeriod([ccv1, shadow]);
    const usd = report.currencies.find((c) => c.currencyCode === "USD");
    expect(usd?.issuedInPeriod).toBe(530.70);
    expect(usd?.invoiceCount).toBe(1);
    expect(report.shadowDuplicatesSkipped).toBe(1);
  });

  it("descarta la sombra cuando el total CCV1 difiere por centavos dentro de tolerancia 0.20", () => {
    // Caso real Aldiesan: shadow trae 96624.00, CCV1 trae 96623.88
    const ccv1 = baseInv({
      id: "ccv1-2",
      invoice_number: "ZETA:CCV1:0:107:A:2970",
      total_amount: 96623.88,
      balance_amount: 96623.88,
      company_id: "company-remiplat",
      category: "Zeta / comprobantes por cliente",
    });
    const shadow = baseInv({
      id: "shadow-2",
      invoice_number: "ZETA:2776",
      total_amount: 96624.00,
      balance_amount: 0,
      status: "paid",
      category: "Zeta / saldos pendientes",
      company_id: "company-remiplat",
    });

    const report = runPeriod([ccv1, shadow]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.issuedInPeriod).toBe(96623.88);
    expect(uyu?.invoiceCount).toBe(1);
    expect(report.shadowDuplicatesSkipped).toBe(1);
  });

  it("descarta sombra aún cuando shadow=paid balance=0 y CCV1 sigue issued con balance=total (caso ZETA-08)", () => {
    const ccv1 = baseInv({
      id: "ccv1-3",
      invoice_number: "ZETA:CCV1:0:144:A:2983",
      total_amount: 68320,
      balance_amount: 68320,
      status: "issued",
      category: "Zeta / comprobantes por cliente",
    });
    const shadow = baseInv({
      id: "shadow-3",
      invoice_number: "ZETA:2746",
      total_amount: 68320,
      balance_amount: 0,
      status: "paid",
      category: "Zeta / saldos pendientes",
    });

    const report = runPeriod([ccv1, shadow]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.issuedInPeriod).toBe(68320);
    expect(uyu?.invoiceCount).toBe(1);
    expect(report.shadowDuplicatesSkipped).toBe(1);
  });

  it("NO descarta una sombra si NO hay CCV1 activo equivalente (no es duplicado)", () => {
    // Sombra solitaria: no hay CCV1 del mismo company+fecha+moneda+total.
    const orphanShadow = baseInv({
      id: "orphan-shadow",
      invoice_number: "ZETA:2999",
      total_amount: 5000,
      balance_amount: 5000,
      status: "issued",
      category: "Zeta / saldos pendientes",
    });

    const report = runPeriod([orphanShadow]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.issuedInPeriod).toBe(5000);
    expect(report.shadowDuplicatesSkipped).toBe(0);
  });

  it("NO descarta una sombra cuando el CCV1 candidato fue anulado (status='cancelled')", () => {
    // Si la CCV1 está anulada, contablemente no existe → la sombra es la única
    // representación válida de la venta y debe contarse.
    const cancelledCcv1 = baseInv({
      id: "ccv1-cancelled",
      invoice_number: "ZETA:CCV1:0:50:A:2900",
      total_amount: 1000,
      balance_amount: 0,
      status: "cancelled",
      category: "Zeta / comprobantes por cliente",
    });
    const shadow = baseInv({
      id: "shadow-with-cancelled-ccv1",
      invoice_number: "ZETA:2900",
      total_amount: 1000,
      balance_amount: 1000,
      status: "issued",
      category: "Zeta / saldos pendientes",
    });

    const report = runPeriod([cancelledCcv1, shadow]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.issuedInPeriod).toBe(1000);
    expect(report.shadowDuplicatesSkipped).toBe(0);
  });

  it("NC CFETipo=112 sigue restando del neto cuando hay duplicación adyacente", () => {
    // Mezcla representativa: 1 CCV1 venta + 1 sombra dup + 1 NC CCV1.
    const ccv1 = baseInv({
      id: "ccv1-real",
      invoice_number: "ZETA:CCV1:0:62:A:2947",
      total_amount: 1830,
      balance_amount: 0,
      status: "paid",
      category: "Zeta / comprobantes por cliente",
    });
    const shadow = baseInv({
      id: "shadow-dup",
      invoice_number: "ZETA:2751",
      total_amount: 1830,
      balance_amount: 0,
      status: "paid",
      category: "Zeta / saldos pendientes",
    });
    const nc = baseInv({
      id: "ccv1-nc",
      invoice_number: "ZETA:CCV1:0:62:A:394",
      total_amount: 1830,
      balance_amount: 0,
      status: "issued",
      category: "Zeta / comprobantes por cliente",
      issue_date: "2026-06-10",
      zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: 112 } },
      is_credit_note: true,
    });

    const report = runPeriod([ccv1, shadow, nc]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.issuedInPeriod).toBe(1830);
    expect(uyu?.creditNoteAmount).toBe(1830);
    expect(uyu?.creditNoteCount).toBe(1);
    expect(report.shadowDuplicatesSkipped).toBe(1);
  });

  it("no afecta filas legacy fuera de category='Zeta / saldos pendientes'", () => {
    // Una fila con invoice_number ZETA:XXX pero category distinta (ej. import
    // manual histórico, backfill) NO se considera sombra del pipeline de saldos.
    const ccv1 = baseInv({
      id: "ccv1-x",
      invoice_number: "ZETA:CCV1:0:1:A:1242",
      total_amount: 305,
      balance_amount: 0,
      status: "paid",
      category: "Zeta / comprobantes por cliente",
    });
    const legacyNonShadow = baseInv({
      id: "legacy-import",
      invoice_number: "ZETA:1234",
      total_amount: 305,
      balance_amount: 305,
      status: "issued",
      // Category distinta — NO es sombra del pipeline.
      category: "Import manual / pre-CCV1",
    });
    const report = runPeriod([ccv1, legacyNonShadow]);
    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.issuedInPeriod).toBe(610);
    expect(report.shadowDuplicatesSkipped).toBe(0);
  });
});
