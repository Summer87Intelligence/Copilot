/**
 * Validación puntual de identidad financiera para un rango de fechas.
 * READ-ONLY — no modifica datos.
 */

import { createClient } from "@supabase/supabase-js";

import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";
import { extractDashboardCurrencyData } from "@/lib/copilot-dashboard-summary";
import {
  generateFinancialConsistencyReport,
  invoiceInputFromProtoRow,
  type ReceiptInput,
} from "@/lib/copilot-financial-reconciliation";
import { carteraPeriodMetricsFromReport } from "@/lib/copilot-today-business-pulse";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import { toSafeNumber } from "@/lib/copilot-numeric-parse";
import { DEFAULT_MAX_ROWS, DEFAULT_PAGE_SIZE, fetchAllRows } from "@/lib/supabase-pagination";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1]! : fallback;
}

async function main(): Promise<void> {
  const from = arg("from", "2026-06-01");
  const to = arg("to", "2026-06-10");
  const ws =
    process.env.WORKSPACE_COMPANY_ID?.trim() ||
    process.env.AUDIT_WORKSPACE_ID?.trim() ||
    "040321ff-10fd-4da3-aeca-f1865f879986";

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const paginationOpts = { pageSize: DEFAULT_PAGE_SIZE, maxRows: DEFAULT_MAX_ROWS };

  const [invoiceFetch, receiptFetch, companyFetch] = await Promise.all([
    fetchAllRows<Record<string, unknown>>({
      ...paginationOpts,
      queryPage: (rangeFrom, rangeTo) =>
        sb
          .from("proto_invoices")
          .select(
            "id,company_id,currency_code,total_amount,balance_amount,status,updated_at,issue_date,due_date,due_date_source,zeta_metadata,category,invoice_number"
          )
          .eq("workspace_company_id", ws)
          .eq("is_active", true)
          .gte("issue_date", MIN_FINANCIAL_DATE)
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo),
    }),
    fetchAllRows<Record<string, unknown>>({
      ...paginationOpts,
      queryPage: (rangeFrom, rangeTo) =>
        sb
          .from("proto_receipts")
          .select("id,company_id,currency_code,amount,receipt_date,status")
          .eq("workspace_company_id", ws)
          .eq("is_active", true)
          .gte("receipt_date", MIN_FINANCIAL_DATE)
          .order("receipt_date", { ascending: true })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo),
    }),
    fetchAllRows<Record<string, unknown>>({
      ...paginationOpts,
      queryPage: (rangeFrom, rangeTo) =>
        sb
          .from("proto_companies")
          .select("id,name")
          .eq("workspace_company_id", ws)
          .eq("is_active", true)
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo),
    }),
  ]);

  const report = generateFinancialConsistencyReport({
    workspaceId: ws,
    invoices: invoiceFetch.rows.map((r) => invoiceInputFromProtoRow(r)),
    receipts: receiptFetch.rows.map(
      (r): ReceiptInput => ({
        id: String(r.id ?? ""),
        company_id: r.company_id != null ? String(r.company_id) : null,
        currency_code: r.currency_code != null ? String(r.currency_code) : null,
        amount: toSafeNumber(r.amount),
        receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
        status: r.status != null ? String(r.status) : null,
      })
    ),
    companies: companyFetch.rows.map((c) => ({
      id: String(c.id ?? ""),
      name: c.name != null ? String(c.name) : null,
    })),
    syncStates: [],
    mode: "period_only",
    periodStart: from,
    periodEnd: to,
  });

  const idx = buildCurrencyIndex(report.currencies);
  const uyu = idx.get("UYU");
  const dash = extractDashboardCurrencyData({
    periodReport: report,
    outstandingReport: report,
    cashPositions: [],
    outflowSummaries: [],
  }).find((d) => d.currency === "UYU");
  const hoy = carteraPeriodMetricsFromReport(report.currencies);

  const fmt = (n: number | undefined) =>
    (n ?? 0).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const expected = {
    ventas: 1_303_047.5,
    cobradoAplicado: 703_622.5,
    pendiente: 599_425,
  };

  const actual = {
    ventas: uyu?.issuedInPeriodNet ?? 0,
    cobradoAplicado: uyu?.portfolioResolvedAmount ?? 0,
    pendiente: uyu?.pendingAtCutoff ?? 0,
  };

  const tol = 0.01;
  const pass = (a: number, e: number) => Math.abs(a - e) <= tol;

  console.log(`\n=== Validación ${from} → ${to} (UYU) ===\n`);
  console.log("CARTERA (buildCurrencyIndex):");
  console.log(`  Ventas del período:     ${fmt(actual.ventas)}`);
  console.log(`  Cobros aplicados:       ${fmt(actual.cobradoAplicado)}`);
  console.log(`  Deuda actual (corte):   ${fmt(actual.pendiente)}`);
  console.log(
    `  Identidad: ${fmt(actual.ventas - actual.cobradoAplicado)} = ${fmt(actual.pendiente)} → ${
      Math.abs(actual.ventas - actual.cobradoAplicado - actual.pendiente) <= tol ? "OK" : "FAIL"
    }`
  );

  console.log("\nDASHBOARD (extractDashboardCurrencyData):");
  console.log(`  Ventas del período:     ${fmt(dash?.facturado)}`);
  console.log(`  Cobrado aplicado:       ${fmt(dash?.cobrado)}`);
  console.log(`  Pendiente del período:  ${fmt(dash?.pendientePeriodo)}`);
  console.log(
    `  vs Cartera: ventas=${Math.abs((dash?.facturado ?? 0) - actual.ventas) <= tol ? "OK" : "FAIL"}, cobrado=${Math.abs((dash?.cobrado ?? 0) - actual.cobradoAplicado) <= tol ? "OK" : "FAIL"}, pendiente=${Math.abs((dash?.pendientePeriodo ?? 0) - actual.pendiente) <= tol ? "OK" : "FAIL"}`
  );

  console.log("\nHOY (carteraPeriodMetricsFromReport):");
  console.log(`  Ventas del período:     ${fmt(hoy.billed.UYU)}`);
  console.log(`  Cobrado aplicado:       ${fmt(hoy.collected.UYU)}`);
  console.log(`  Pendiente:              ${fmt(hoy.pending.UYU)}`);
  console.log(
    `  vs Cartera: ventas=${Math.abs(hoy.billed.UYU - actual.ventas) <= tol ? "OK" : "FAIL"}, cobrado=${Math.abs(hoy.collected.UYU - actual.cobradoAplicado) <= tol ? "OK" : "FAIL"}, pendiente=${Math.abs(hoy.pending.UYU - actual.pendiente) <= tol ? "OK" : "FAIL"}`
  );

  console.log("\nEXPECTATIVA USUARIO:");
  console.log(
    `  ventas:           ${pass(actual.ventas, expected.ventas) ? "PASS" : "FAIL"} (esperado ${fmt(expected.ventas)})`
  );
  console.log(
    `  cobrado aplicado: ${pass(actual.cobradoAplicado, expected.cobradoAplicado) ? "PASS" : "FAIL"} (esperado ${fmt(expected.cobradoAplicado)})`
  );
  console.log(
    `  pendiente:        ${pass(actual.pendiente, expected.pendiente) ? "PASS" : "FAIL"} (esperado ${fmt(expected.pendiente)})`
  );

  const dashCarteraPass =
    Math.abs((dash?.facturado ?? 0) - actual.ventas) <= tol &&
    Math.abs((dash?.cobrado ?? 0) - actual.cobradoAplicado) <= tol &&
    Math.abs((dash?.pendientePeriodo ?? 0) - actual.pendiente) <= tol;

  const hoyPass =
    Math.abs(hoy.billed.UYU - actual.ventas) <= tol &&
    Math.abs(hoy.collected.UYU - actual.cobradoAplicado) <= tol &&
    Math.abs(hoy.pending.UYU - actual.pendiente) <= tol;

  const allPass =
    pass(actual.ventas, expected.ventas) &&
    pass(actual.cobradoAplicado, expected.cobradoAplicado) &&
    pass(actual.pendiente, expected.pendiente) &&
    dashCarteraPass &&
    hoyPass;

  console.log(`\nRESULTADO GLOBAL: ${allPass ? "PASS" : "FAIL"}\n`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
