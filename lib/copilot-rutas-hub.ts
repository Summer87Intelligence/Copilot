import type { FinancialSnapshot } from "@/lib/copilot-financial-engine";
import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import type { TaxAgendaItem } from "@/lib/copilot-tax-data";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";

export type RutasHubData = {
  snapshot: FinancialSnapshot | null;
  fiscalAlerts: FiscalAlertItem[];
  taxAgenda: TaxAgendaItem[];
  portfolio: ClientPortfolioLoad | null;
  avgCollectionPct: number | null;
  pendingDecisions: number;
};

export function formatRutasPeriodLabel(d = new Date()): string {
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export function totalFiscalAlertsCount(alerts: FiscalAlertItem[]): number {
  return alerts.length;
}

export function fiscalCriticalHighCounts(alerts: FiscalAlertItem[]): {
  critical: number;
  high: number;
} {
  let critical = 0;
  let high = 0;
  for (const a of alerts) {
    if (a.priority === "critical") critical += 1;
    else if (a.priority === "high") high += 1;
  }
  return { critical, high };
}

export function simplifiedSaludLabel(
  alerts: FiscalAlertItem[],
  snapshot: FinancialSnapshot | null
): { label: string; tone: "critical" | "warning" | "ok" } {
  const { critical, high } = fiscalCriticalHighCounts(alerts);
  if (critical >= 1) return { label: "Crítica", tone: "critical" };
  if (high >= 1) return { label: "Atención", tone: "warning" };
  if (snapshot?.risk_level === "high" || snapshot?.risk_level === "critical") {
    return { label: "Atención", tone: "warning" };
  }
  return { label: "Estable", tone: "ok" };
}

export function sumPortfolioOverdueDebt(portfolio: ClientPortfolioLoad | null): number {
  if (!portfolio?.rows?.length) return 0;
  let t = 0;
  for (const r of portfolio.rows) {
    t += r.overdue_debt;
  }
  return t;
}

export function countTaxAgendaUpcoming(
  agenda: TaxAgendaItem[],
  maxDaysAhead: number
): number {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  let n = 0;
  for (const o of agenda) {
    const ymd = o.due_date.slice(0, 10);
    const d = new Date(ymd + "T12:00:00");
    if (Number.isNaN(d.getTime())) continue;
    const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
    if (diff >= 0 && diff <= maxDaysAhead) n += 1;
  }
  return n;
}

export function hasHighRiskClients(portfolio: ClientPortfolioLoad | null): boolean {
  if (!portfolio?.rows?.length) return false;
  return portfolio.rows.some((r) => r.risk === "Alto" || r.overdue_debt > 0);
}

export type RutasVisibility = {
  empezar: boolean;
  caja: boolean;
  cobranza: boolean;
  pagosImpuestos: boolean;
  clientesRiesgo: boolean;
  decisiones: boolean;
};

export function buildRutasVisibility(data: RutasHubData): RutasVisibility {
  const overdue = sumPortfolioOverdueDebt(data.portfolio);
  const alerts = data.fiscalAlerts.length;
  const pending = data.pendingDecisions;

  return {
    empezar: true,
    caja: true,
    cobranza: overdue > 0,
    pagosImpuestos: true,
    clientesRiesgo: hasHighRiskClients(data.portfolio),
    decisiones: pending > 0,
  };
}

export function formatMoneyRutas(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function formatCoverageRutas(r: number): string {
  if (!Number.isFinite(r) || r > 100) return "—";
  return `${r.toFixed(1)}×`;
}
