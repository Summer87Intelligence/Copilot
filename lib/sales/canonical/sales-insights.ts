/**
 * FASE 9B — Motor de insights comerciales. PURO y determinístico (sin LLM).
 *
 * Reglas: máximo 5 insights, ordenados por relevancia, sin duplicar el mismo
 * dato, sin porcentajes con base cero, sin mezclar monedas, con período
 * comparado indicado, texto claro y sin jerga.
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

function qty(n: number): string {
  return n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
}

export function buildSalesExecutiveInsights(input: SalesInsightsInput): SalesInsight[] {
  const { snapshot, comparison, products, customers, salespersons, comparisonLabel } = input;
  const out: SalesInsight[] = [];

  // Solo productos reales (excluye "Sin detalle").
  const realProducts = products.filter((p) => p.normalizationStatus !== "missing_detail");

  // 1. Servicio más vendido (por cantidad).
  const byUnits = [...realProducts].sort((a, b) => b.quantity - a.quantity);
  if (byUnits[0] && byUnits[0].quantity > 0) {
    out.push({
      id: "top-units",
      text: `${byUnits[0].productName} fue el servicio más vendido: ${qty(byUnits[0].quantity)} ${byUnits[0].quantity === 1 ? "unidad" : "unidades"}.`,
      tone: "neutral",
    });
  }

  // 2. Mayor facturación USD (si hay USD).
  const byUsd = [...realProducts].sort((a, b) => b.totalByCurrency.USD - a.totalByCurrency.USD);
  if (byUsd[0] && byUsd[0].totalByCurrency.USD > 0 && byUsd[0].key !== byUnits[0]?.key) {
    out.push({
      id: "top-usd",
      text: `${byUsd[0].productName} generó la mayor facturación en USD (${formatMoneyCurrency(byUsd[0].totalByCurrency.USD, "USD")}).`,
      tone: "neutral",
    });
  }

  // 3. Variación de ventas por moneda (sin base cero).
  for (const cur of ["USD", "UYU"] as const) {
    const pct = comparison.salesPctByCurrency[cur];
    if (pct !== null && Math.abs(pct) >= 1) {
      const dir = pct > 0 ? "crecieron" : "bajaron";
      out.push({
        id: `var-${cur}`,
        text: `Las ventas ${cur} ${dir} ${Math.abs(pct).toLocaleString("es-UY", { maximumFractionDigits: 1 })}% frente a ${comparisonLabel}.`,
        tone: pct > 0 ? "positive" : "warning",
      });
      break; // solo la moneda más relevante
    }
  }

  // 4. Delta de unidades.
  if (comparison.unitsDelta !== 0) {
    const more = comparison.unitsDelta > 0;
    out.push({
      id: "units-delta",
      text: `Se vendieron ${qty(Math.abs(comparison.unitsDelta))} ${Math.abs(comparison.unitsDelta) === 1 ? "servicio" : "servicios"} ${more ? "más" : "menos"} que en ${comparisonLabel}.`,
      tone: more ? "positive" : "warning",
    });
  }

  // 5. Clientes nuevos.
  if (snapshot.newCustomers > 0) {
    out.push({
      id: "new-customers",
      text: `${snapshot.newCustomers} ${snapshot.newCustomers === 1 ? "cliente compró" : "clientes compraron"} por primera vez.`,
      tone: "positive",
    });
  }

  // 6. Comercial líder (si hay asignaciones).
  const assigned = salespersons.filter((s) => s.salespersonId !== null);
  if (assigned.length > 0) {
    const leaderUsd = [...assigned].sort((a, b) => b.salesByCurrency.USD - a.salesByCurrency.USD)[0]!;
    const leaderUyu = [...assigned].sort((a, b) => b.salesByCurrency.UYU - a.salesByCurrency.UYU)[0]!;
    if (leaderUsd.salesByCurrency.USD > 0) {
      out.push({ id: "leader-usd", text: `${leaderUsd.salespersonName} lideró las ventas USD.`, tone: "neutral" });
    } else if (leaderUyu.salesByCurrency.UYU > 0) {
      out.push({ id: "leader-uyu", text: `${leaderUyu.salespersonName} lideró las ventas UYU.`, tone: "neutral" });
    }
  }

  // 7. Concentración de clientes (top 3 USD).
  const usdCustomers = [...customers].sort((a, b) => b.salesByCurrency.USD - a.salesByCurrency.USD);
  const totalUsd = customers.reduce((s, c) => s + c.salesByCurrency.USD, 0);
  if (totalUsd > 0 && usdCustomers.length >= 3) {
    const top3 = usdCustomers.slice(0, 3).reduce((s, c) => s + c.salesByCurrency.USD, 0);
    const share = Math.round((top3 / totalUsd) * 1000) / 10;
    if (share >= 20) {
      out.push({ id: "concentration", text: `El ${share.toLocaleString("es-UY", { maximumFractionDigits: 1 })}% de las ventas USD provino de 3 clientes.`, tone: "warning" });
    }
  }

  return out.slice(0, 5);
}
