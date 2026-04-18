/**
 * Insights Copilot MVP — solo datos reales visibles (proto_* + snapshot financiero).
 * Sin scores persistidos, sin texto mock, sin heurísticas no explicables en UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClientCompanyDetail, ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { getFinancialSnapshot, type FinancialSnapshot } from "@/lib/copilot-financial-engine";
import { getOverdueTaxObligations, type ProtoTaxObligation } from "@/lib/copilot-tax-data";
import { supabase } from "@/lib/supabase-client";

export type CopilotRealInsightType =
  | "deuda_vencida"
  | "concentracion_deuda"
  | "obl_fiscal_vencida"
  | "desbalance_caja"
  | "atraso_historico";

type BaseInsight = {
  id: string;
  message: string;
  action: string;
  href: string;
  /** Línea corta para UI: qué datos concretos respaldan la tarjeta. */
  basedOnLine: string;
};

export type CopilotRealInsightDeudaVencida = BaseInsight & {
  type: "deuda_vencida";
  company_id: string;
  company_name: string;
  evidence: {
    amount: number;
    invoices_count: number;
    days_overdue: number;
  };
};

export type CopilotRealInsightConcentracionDeuda = BaseInsight & {
  type: "concentracion_deuda";
  company_id: null;
  company_name: string;
  evidence: {
    total_overdue: number;
    top2_amount: number;
    top2_share_pct: number;
    client_names: [string, string];
  };
};

export type CopilotRealInsightOblFiscalVencida = BaseInsight & {
  type: "obl_fiscal_vencida";
  company_id: null;
  company_name: string;
  evidence: {
    obligation_id: string;
    amount: number;
    due_date: string;
    days_overdue: number;
    tax_type: string;
    period_label: string;
  };
};

export type CopilotRealInsightDesbalanceCaja = BaseInsight & {
  type: "desbalance_caja";
  company_id: null;
  company_name: string;
  evidence: {
    available_cash: number;
    expected_inflows: number;
    expected_outflows: number;
    projected_balance: number;
    coverage_ratio: number;
    risk_level: string;
  };
};

export type CopilotRealInsightAtrasoHistorico = BaseInsight & {
  type: "atraso_historico";
  company_id: string;
  company_name: string;
  evidence: {
    invoices_count: number;
    overdue_invoices: number;
    payment_behavior: "lento";
  };
};

export type CopilotRealInsight =
  | CopilotRealInsightDeudaVencida
  | CopilotRealInsightConcentracionDeuda
  | CopilotRealInsightOblFiscalVencida
  | CopilotRealInsightDesbalanceCaja
  | CopilotRealInsightAtrasoHistorico;

const MIN_INVOICES_FOR_ATRASO = 4;
const EPS = 0.5;
const CONC_MIN_TWO_CLIENTS_SHARE = 0.5;

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00`);
  const b = new Date(`${toYmd}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function formatPct(ratio: number): string {
  return `${(ratio * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Tablas: proto_invoices (vía ClientCompanyDetail.invoices), alineado con overdue_debt de cartera.
 * Condición: factura con balance > 0 y due_date < hoy.
 */
function overdueInvoiceStats(
  detail: ClientCompanyDetail,
  today: string
): { count: number; maxDaysOverdue: number } {
  let count = 0;
  let maxDays = 0;
  for (const inv of detail.invoices) {
    if (inv.balance_amount <= EPS) continue;
    const due = inv.due_date.slice(0, 10);
    if (!due || due.length < 10 || due >= today) continue;
    count += 1;
    const d = daysBetweenYmd(due, today);
    if (d > maxDays) maxDays = d;
  }
  return { count, maxDaysOverdue: maxDays };
}

function hrefCliente(companyId: string): string {
  return `/copilot/clientes?c=${encodeURIComponent(companyId)}`;
}

function detectDeudaVencida(
  load: ClientPortfolioLoad,
  today: string
): CopilotRealInsightDeudaVencida[] {
  const out: CopilotRealInsightDeudaVencida[] = [];
  for (const row of load.rows) {
    if (row.overdue_debt <= EPS) continue;
    const detail = load.details[row.company_id];
    if (!detail) continue;
    const { count, maxDaysOverdue } = overdueInvoiceStats(detail, today);
    if (count === 0) continue;
    const amount = row.overdue_debt;
    out.push({
      id: `deuda_vencida:${row.company_id}`,
      type: "deuda_vencida",
      company_id: row.company_id,
      company_name: row.name,
      evidence: {
        amount,
        invoices_count: count,
        days_overdue: maxDaysOverdue,
      },
      message: `Cliente con deuda vencida por ${formatMoney(amount)}`,
      action: "Ver cliente",
      href: hrefCliente(row.company_id),
      basedOnLine: `Basado en: ${count} factura${count === 1 ? "" : "s"} con vencimiento anterior a hoy y saldo pendiente`,
    });
  }
  out.sort((a, b) => b.evidence.amount - a.evidence.amount);
  return out;
}

/**
 * Tablas: agregación de overdue_debt por fila de proto_companies / proto_invoices.
 * Condición: al menos 2 clientes con vencido y los 2 mayores concentran ≥ 50 % del vencido total.
 */
function detectConcentracionDeuda(load: ClientPortfolioLoad): CopilotRealInsightConcentracionDeuda | null {
  const withOverdue = load.rows
    .filter((r) => r.overdue_debt > EPS)
    .sort((a, b) => b.overdue_debt - a.overdue_debt);
  if (withOverdue.length < 2) return null;
  const total = withOverdue.reduce((s, r) => s + r.overdue_debt, 0);
  if (total <= EPS) return null;
  const top2 = withOverdue[0].overdue_debt + withOverdue[1].overdue_debt;
  const share = top2 / total;
  if (share < CONC_MIN_TWO_CLIENTS_SHARE) return null;
  return {
    id: "concentracion_deuda:portfolio",
    type: "concentracion_deuda",
    company_id: null,
    company_name: "Cartera",
    evidence: {
      total_overdue: total,
      top2_amount: top2,
      top2_share_pct: share,
      client_names: [withOverdue[0].name, withOverdue[1].name],
    },
    message: `El ${formatPct(share)} de la deuda vencida está en ${withOverdue[0].name} y ${withOverdue[1].name}`,
    action: "Ver clientes",
    href: "/copilot/clientes",
    basedOnLine: `Basado en: suma de saldos vencidos en proto_invoices (${formatMoney(total)} total)`,
  };
}

function obligationRemaining(o: ProtoTaxObligation): number {
  const est = o.estimated_amount;
  const conf = o.confirmed_amount;
  if (conf != null && Number.isFinite(conf)) return Math.max(0, est - conf);
  return Math.max(0, est);
}

/**
 * Tablas: proto_tax_obligations (+ estado; excluye pagadas).
 * Condición: due_date < hoy o status overdue, y saldo pendiente > 0.
 */
async function detectOblFiscalVencidas(
  today: string,
  client: SupabaseClient
): Promise<CopilotRealInsightOblFiscalVencida[]> {
  const overdue = await getOverdueTaxObligations(client);
  const out: CopilotRealInsightOblFiscalVencida[] = [];
  for (const o of overdue) {
    const rem = obligationRemaining(o);
    if (rem <= EPS) continue;
    const due = o.due_date.slice(0, 10);
    const days = daysBetweenYmd(due, today);
    out.push({
      id: `obl_fiscal_vencida:${o.id}`,
      type: "obl_fiscal_vencida",
      company_id: null,
      company_name: "Obligación fiscal",
      evidence: {
        obligation_id: o.id,
        amount: rem,
        due_date: due,
        days_overdue: days,
        tax_type: o.tax_type,
        period_label: o.period_label,
      },
      message: `Obligación fiscal vencida (${o.tax_type} · ${o.period_label}): ${formatMoney(rem)}`,
      action: "Ver finanzas",
      href: "/copilot/finanzas#copilot-finanzas-fiscal",
      basedOnLine: `Basado en: obligación en proto_tax_obligations con vencimiento ${due} y saldo pendiente`,
    });
  }
  out.sort((a, b) => b.evidence.days_overdue - a.evidence.days_overdue);
  return out;
}

/**
 * Tablas: proto_receipts, proto_payments, proto_invoices, proto_tax_* (mismo pipeline que getFinancialSnapshot).
 * Condición: egresos esperados > 0 y cobertura < 1, o balance proyectado < 0, o riesgo high/critical.
 */
function detectDesbalanceCaja(snapshot: FinancialSnapshot): CopilotRealInsightDesbalanceCaja | null {
  const tight =
    (snapshot.expected_outflows > EPS && snapshot.coverage_ratio < 1) ||
    snapshot.projected_balance < -EPS ||
    snapshot.risk_level === "high" ||
    snapshot.risk_level === "critical";
  if (!tight) return null;
  return {
    id: "desbalance_caja:global",
    type: "desbalance_caja",
    company_id: null,
    company_name: "Caja",
    evidence: {
      available_cash: snapshot.available_cash,
      expected_inflows: snapshot.expected_inflows,
      expected_outflows: snapshot.expected_outflows,
      projected_balance: snapshot.projected_balance,
      coverage_ratio: snapshot.coverage_ratio,
      risk_level: snapshot.risk_level,
    },
    message: `Desbalance de caja: cobertura ${formatPct(snapshot.coverage_ratio)} y balance proyectado ${formatMoney(snapshot.projected_balance)}`,
    action: "Ver finanzas",
    href: "/copilot/finanzas#copilot-finanzas-panorama",
    basedOnLine:
      "Basado en: recibos, pagos operativos, facturas abiertas y obligaciones fiscales próximas (mismo snapshot que Finanzas)",
  };
}

/**
 * Tablas: proto_invoices por cliente (misma función paymentBehaviorForInvoices vía fila cartera).
 * Condición: payment_behavior === "lento" y al menos MIN_INVOICES_FOR_ATRASO facturas en la cuenta.
 * Además debe haber al menos una factura vencida con saldo para no confundir con ruido sin mora real.
 */
function detectAtrasoHistorico(load: ClientPortfolioLoad, today: string): CopilotRealInsightAtrasoHistorico[] {
  const out: CopilotRealInsightAtrasoHistorico[] = [];
  for (const row of load.rows) {
    if (row.payment_behavior !== "lento") continue;
    if (row.invoices_count < MIN_INVOICES_FOR_ATRASO) continue;
    const detail = load.details[row.company_id];
    if (!detail) continue;
    const { count: overdueInv } = overdueInvoiceStats(detail, today);
    if (overdueInv < 1) continue;
    out.push({
      id: `atraso_historico:${row.company_id}`,
      type: "atraso_historico",
      company_id: row.company_id,
      company_name: row.name,
      evidence: {
        invoices_count: row.invoices_count,
        overdue_invoices: overdueInv,
        payment_behavior: "lento",
      },
      message: `Patrón de atraso en pagos en ${row.name} (${row.invoices_count} facturas registradas)`,
      action: "Ver cliente",
      href: hrefCliente(row.company_id),
      basedOnLine: `Basado en: ${overdueInv} factura${overdueInv === 1 ? "" : "s"} vencida${overdueInv === 1 ? "" : "s"} con saldo y ratio de mora en histórico de facturas`,
    });
  }
  return out;
}

/**
 * Orden de presentación: caja global, deudas por monto, fiscal, concentración, atraso histórico.
 */
export async function computeCopilotRealInsights(
  client: SupabaseClient = supabase
): Promise<CopilotRealInsight[]> {
  const today = todayYmd();
  const [load, snapshot] = await Promise.all([
    getClientPortfolio(client),
    getFinancialSnapshot(client),
  ]);

  const fiscal = await detectOblFiscalVencidas(today, client);

  const caja = detectDesbalanceCaja(snapshot);
  const deudas = detectDeudaVencida(load, today);
  const conc = detectConcentracionDeuda(load);
  const atraso = detectAtrasoHistorico(load, today);

  const ordered: CopilotRealInsight[] = [];
  if (caja) ordered.push(caja);
  ordered.push(...deudas);
  ordered.push(...fiscal);
  if (conc) ordered.push(conc);
  ordered.push(...atraso);
  return ordered;
}

export function countInsightsByKind(insights: CopilotRealInsight[]): {
  total: number;
  deudaVencida: number;
  fiscalVencida: number;
  desbalanceCaja: number;
} {
  return {
    total: insights.length,
    deudaVencida: insights.filter((i) => i.type === "deuda_vencida").length,
    fiscalVencida: insights.filter((i) => i.type === "obl_fiscal_vencida").length,
    desbalanceCaja: insights.some((i) => i.type === "desbalance_caja") ? 1 : 0,
  };
}
