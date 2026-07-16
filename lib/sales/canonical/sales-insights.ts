/**
 * FASE 9D — Motor de insights comerciales. PURO y determinístico (sin LLM).
 *
 * Reglas: máximo 5 insights, ordenados por relevancia, sin duplicar el mismo
 * dato, sin porcentajes con base cero, sin mezclar monedas. KPI = ventas netas.
 */

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type {
  SalesPeriodSnapshot,
  SalesComparison,
  ProductSalesSummaryRow,
  CustomerSalesSummaryRow,
  SalespersonSummaryRow,
} from "@/lib/sales/canonical/types";

export type SalesInsight = {
  id: string;
  text: string;
  tone: "positive" | "warning" | "neutral";
};

export type SalesInsightsInput = {
  snapshot: SalesPeriodSnapshot;
  comparison: SalesComparison;
  products: readonly ProductSalesSummaryRow[];
  customers: readonly CustomerSalesSummaryRow[];
  salespersons: readonly SalespersonSummaryRow[];
  comparisonLabel: string;
};

export function buildSalesExecutiveInsights(input: SalesInsightsInput): SalesInsight[] {
  const { snapshot, comparison, products, customers, salespersons, comparisonLabel } = input;
  const out: SalesInsight[] = [];

  const realProducts = products.filter((p) => p.normalizationStatus !== "missing_detail");

  // 1. Impacto de notas de crédito (si material).
  if (snapshot.creditNoteCount > 0 && (snapshot.creditNotes.USD > 0 || snapshot.creditNotes.UYU > 0)) {
    const parts: string[] = [];
    if (snapshot.creditNotes.USD > 0) {
      parts.push(formatMoneyCurrency(snapshot.creditNotes.USD, "USD"));
    }
    if (snapshot.creditNotes.UYU > 0) {
      parts.push(formatMoneyCurrency(snapshot.creditNotes.UYU, "UYU"));
    }
    out.push({
      id: "credit-notes-impact",
      text: `Las notas de crédito redujeron las ventas netas del período en ${parts.join(" y ")}.`,
      tone: "warning",
    });
  }

  // 2. Servicio con mayor venta emitida (servicios no absorben NC sin vínculo).
  const byUsd = [...realProducts].sort((a, b) => b.totalByCurrency.USD - a.totalByCurrency.USD);
  const byUyu = [...realProducts].sort((a, b) => b.totalByCurrency.UYU - a.totalByCurrency.UYU);
  if (byUsd[0] && byUsd[0].totalByCurrency.USD > 0) {
    out.push({
      id: "top-service-usd",
      text: `${byUsd[0].productName} fue el servicio con mayor venta en USD (${formatMoneyCurrency(byUsd[0].totalByCurrency.USD, "USD")}).`,
      tone: "neutral",
    });
  } else if (byUyu[0] && byUyu[0].totalByCurrency.UYU > 0) {
    out.push({
      id: "top-service-uyu",
      text: `${byUyu[0].productName} fue el servicio con mayor venta en UYU (${formatMoneyCurrency(byUyu[0].totalByCurrency.UYU, "UYU")}).`,
      tone: "neutral",
    });
  }

  // 3. Variación de ventas netas.
  for (const cur of ["USD", "UYU"] as const) {
    const pct = comparison.salesPctByCurrency[cur];
    if (pct !== null && Math.abs(pct) >= 1) {
      const dir = pct > 0 ? "crecieron" : "bajaron";
      out.push({
        id: `var-net-${cur}`,
        text: `Las ventas netas ${cur} ${dir} ${Math.abs(pct).toLocaleString("es-UY", { maximumFractionDigits: 1 })}% frente a ${comparisonLabel}.`,
        tone: pct > 0 ? "positive" : "warning",
      });
      break;
    }
  }

  // 4. Clientes nuevos.
  if (snapshot.newCustomers > 0) {
    out.push({
      id: "new-customers",
      text: `${snapshot.newCustomers} ${snapshot.newCustomers === 1 ? "cliente compró" : "clientes compraron"} por primera vez.`,
      tone: "positive",
    });
  }

  // 5. Comercial líder por ventas netas.
  const assigned = salespersons.filter((s) => s.salespersonId !== null);
  if (assigned.length > 0) {
    const leaderUsd = [...assigned].sort((a, b) => b.netSalesByCurrency.USD - a.netSalesByCurrency.USD)[0]!;
    const leaderUyu = [...assigned].sort((a, b) => b.netSalesByCurrency.UYU - a.netSalesByCurrency.UYU)[0]!;
    if (leaderUsd.netSalesByCurrency.USD > 0) {
      out.push({
        id: "leader-net-usd",
        text: `${leaderUsd.salespersonName} generó la mayor venta neta USD.`,
        tone: "neutral",
      });
    } else if (leaderUyu.netSalesByCurrency.UYU > 0) {
      out.push({
        id: "leader-net-uyu",
        text: `${leaderUyu.salespersonName} generó la mayor venta neta UYU.`,
        tone: "neutral",
      });
    }
  }

  // 6. Clientes sin comercial (si aplica).
  const unassigned = salespersons.find((s) => s.salespersonId === null);
  if (unassigned && unassigned.customerCount > 0 && out.length < 5) {
    out.push({
      id: "unassigned-customers",
      text: `Quedan ${unassigned.customerCount} cliente${unassigned.customerCount === 1 ? "" : "s"} del período sin comercial asignado.`,
      tone: "warning",
    });
  }

  // 7. Concentración de clientes (top 3 por venta neta USD).
  const usdCustomers = [...customers].sort((a, b) => b.netSalesByCurrency.USD - a.netSalesByCurrency.USD);
  const totalUsd = customers.reduce((s, c) => s + c.netSalesByCurrency.USD, 0);
  if (totalUsd > 0 && usdCustomers.length >= 3 && out.length < 5) {
    const top3 = usdCustomers.slice(0, 3).reduce((s, c) => s + c.netSalesByCurrency.USD, 0);
    const share = Math.round((top3 / totalUsd) * 1000) / 10;
    if (share >= 20) {
      out.push({
        id: "concentration-net",
        text: `El ${share.toLocaleString("es-UY", { maximumFractionDigits: 1 })}% de las ventas netas USD provino de 3 clientes.`,
        tone: "warning",
      });
    }
  }

  // 8. Delta de facturas.
  if (out.length < 5 && comparison.invoiceDelta !== 0) {
    const more = comparison.invoiceDelta > 0;
    out.push({
      id: "invoice-delta",
      text: `Se emitieron ${Math.abs(comparison.invoiceDelta)} factura${Math.abs(comparison.invoiceDelta) === 1 ? "" : "s"} ${more ? "más" : "menos"} que en ${comparisonLabel}.`,
      tone: more ? "positive" : "warning",
    });
  }

  return out.slice(0, 5);
}
