import {
  loadInsightEngineProtoRows,
  selectProtoCompaniesInsightWindow,
  selectProtoInvoicesInsightWindow,
  selectProtoPaymentsInsightWindow,
} from "@/lib/data/proto-analytics-read-repository";
import { supabase } from "@/lib/supabase-client";
import type { CopilotInsightEvidenceCase } from "@/lib/copilot-insights-evidence-mock";
import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";

/** Límite por tabla en el motor de insights (Bloque 13: cobertura explícita). */
export const INSIGHT_ENGINE_ROW_LIMIT = 100;
const ROW_LIMIT = INSIGHT_ENGINE_ROW_LIMIT;

const DEBT_CRITICAL_THRESHOLD = 500_000;
const REVENUE_SHARE_DOMINANCE = 0.4;
const PAYMENT_DROP_RATIO = 0.5;

const INVOICE_DEBT_STATUSES = new Set(["issued", "overdue", "partial"]);

export type InsightPriority = "Alta" | "Media" | "Baja";
export type InsightStatus = "Activo" | "En seguimiento";

export type CopilotInsightItem = {
  id: string;
  title: string;
  priority: InsightPriority;
  category: string;
  status: InsightStatus;
  date: string;
  evidence: CopilotInsightEvidenceCase;
  /** Instantáneo del cálculo server-side (trazabilidad Bloque 13). */
  computedAtIso?: string;
};

export type DebtByCompanyRow = {
  company_id: string;
  company_name: string;
  debt: number;
};

export type OverdueInvoiceRow = Record<string, unknown> & {
  id?: string;
  company_id?: string;
  invoice_number?: string;
  balance_amount?: number | string;
  due_date?: string;
};

export type RevenueByCompanyRow = {
  company_id: string;
  company_name: string;
  revenue: number;
};

export type PaymentRow = Record<string, unknown>;

function todayEsUy(): string {
  return new Date().toLocaleDateString("es-UY");
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseDay(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfTodayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function priorityToSeverity(p: InsightPriority): CopilotSeverity {
  if (p === "Alta") return "high";
  if (p === "Media") return "medium";
  return "low";
}

function formatMoneyEs(n: number): string {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return `${(n * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`;
}

async function fetchProtoInvoices(): Promise<Record<string, unknown>[]> {
  const { data, error } = await selectProtoInvoicesInsightWindow(supabase);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchProtoPayments(): Promise<Record<string, unknown>[]> {
  const { data, error } = await selectProtoPaymentsInsightWindow(supabase);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchProtoCompanies(): Promise<Record<string, unknown>[]> {
  const { data, error } = await selectProtoCompaniesInsightWindow(supabase);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

function buildCompanyNameMap(companies: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of companies) {
    const id = c.id != null ? String(c.id) : "";
    const name = c.name != null ? String(c.name) : "Sin nombre";
    if (id) m.set(id, name);
  }
  return m;
}

export async function getDebtByCompany(): Promise<DebtByCompanyRow[]> {
  const [invoices, companies] = await Promise.all([
    fetchProtoInvoices(),
    fetchProtoCompanies(),
  ]);
  const names = buildCompanyNameMap(companies);
  const byCompany = new Map<string, number>();

  for (const inv of invoices) {
    const status = String(inv.status ?? "").toLowerCase().trim();
    if (!INVOICE_DEBT_STATUSES.has(status)) continue;
    const cid = inv.company_id != null ? String(inv.company_id) : "";
    if (!cid) continue;
    const bal = toNumber(inv.balance_amount);
    byCompany.set(cid, (byCompany.get(cid) ?? 0) + bal);
  }

  return [...byCompany.entries()].map(([company_id, debt]) => ({
    company_id,
    company_name: names.get(company_id) ?? company_id,
    debt,
  }));
}

export async function getOverdueInvoices(): Promise<OverdueInvoiceRow[]> {
  const invoices = await fetchProtoInvoices();
  const today = startOfTodayUtc();
  const out: OverdueInvoiceRow[] = [];

  for (const inv of invoices) {
    const bal = toNumber(inv.balance_amount);
    if (bal <= 0) continue;
    const due = inv.due_date != null ? String(inv.due_date) : "";
    const d = parseDay(due);
    if (!d || d >= today) continue;
    out.push(inv as OverdueInvoiceRow);
  }

  return out;
}

export async function getRevenueByCompany(): Promise<RevenueByCompanyRow[]> {
  const [invoices, companies] = await Promise.all([
    fetchProtoInvoices(),
    fetchProtoCompanies(),
  ]);
  const names = buildCompanyNameMap(companies);
  const byCompany = new Map<string, number>();

  for (const inv of invoices) {
    const cid = inv.company_id != null ? String(inv.company_id) : "";
    if (!cid) continue;
    const total = toNumber(inv.total_amount);
    byCompany.set(cid, (byCompany.get(cid) ?? 0) + total);
  }

  return [...byCompany.entries()].map(([company_id, revenue]) => ({
    company_id,
    company_name: names.get(company_id) ?? company_id,
    revenue,
  }));
}

export async function getPaymentsLast30Days(): Promise<PaymentRow[]> {
  const payments = await fetchProtoPayments();
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  return payments.filter((p) => {
    const raw = p.payment_date ?? p.created_at;
    if (raw == null) return false;
    const d = parseDay(String(raw));
    if (!d) return false;
    return d >= cutoff && d <= now;
  }) as PaymentRow[];
}

function sumPaymentsInWindow(
  payments: PaymentRow[],
  start: Date,
  end: Date
): number {
  let s = 0;
  for (const p of payments) {
    const raw = p.payment_date ?? p.created_at;
    if (raw == null) continue;
    const d = parseDay(String(raw));
    if (!d || d < start || d > end) continue;
    s += toNumber(p.amount);
  }
  return s;
}

function buildEvidence(params: {
  id: string;
  title: string;
  subtitle: string;
  priority: InsightPriority;
  executive: string;
  relevance: string;
  impact: string;
  pattern: string;
  evolution: string;
  indicators: Array<{ label: string; value: string; severity: CopilotSeverity }>;
  signals: Array<{
    label: string;
    detail: string;
    date: string;
    amount?: string;
    severity: CopilotSeverity;
  }>;
  conclusion: string;
  classification: string;
  recommend: string;
}): CopilotInsightEvidenceCase {
  const now = new Date();
  const updatedAt = `${now.toLocaleDateString("es-UY")} · ${now.toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  return {
    insightId: params.id,
    title: params.title,
    subtitle: params.subtitle,
    updatedAt,
    primarySeverity: priorityToSeverity(params.priority),
    summary: {
      executive: params.executive,
      relevance: params.relevance,
      impact: params.impact,
    },
    pattern: {
      pattern: params.pattern,
      evolution: params.evolution,
    },
    originIndicators: params.indicators.map((row, i) => ({
      id: `${params.id}-k${i + 1}`,
      label: row.label,
      value: row.value,
      severity: row.severity,
    })),
    signals: params.signals.map((row, i) => ({
      id: `${params.id}-s${i + 1}`,
      label: row.label,
      detail: row.detail,
      date: row.date,
      amount: row.amount,
      severity: row.severity,
    })),
    aiRead: {
      conclusion: params.conclusion,
      classification: params.classification,
      recommend: params.recommend,
    },
  };
}

function stampComputedAt(items: CopilotInsightItem[]): CopilotInsightItem[] {
  const computedAtIso = new Date().toISOString();
  return items.map((i) => ({ ...i, computedAtIso }));
}

function emptyInsight(date: string): CopilotInsightItem[] {
  return [
    {
      id: "empty",
      title: "Sin datos suficientes para generar insights",
      priority: "Baja",
      category: "Sistema",
      status: "Activo",
      date,
      evidence: buildEvidence({
        id: "empty",
        title: "Sin datos suficientes para generar insights",
        subtitle: "No hay volumen mínimo en facturas, pagos o empresas para inferir patrones.",
        priority: "Baja",
        executive:
          "El motor no encontró combinaciones de facturas, saldos y pagos suficientes en el lote consultado.",
        relevance: "Sin señales consistentes, priorizar calidad de datos antes de decisiones automáticas.",
        impact: "Riesgo de falsos positivos si se forzaran alertas sin respaldo cuantitativo.",
        pattern: "Dataset vacío o por debajo del umbral de análisis en proto_*.",
        evolution: "Revisar carga de datos y ampliar ventana temporal si aplica.",
        indicators: [
          { label: "Registros analizados", value: "0", severity: "low" },
        ],
        signals: [],
        conclusion: "Operar con datos incompletos reduce la utilidad del copiloto.",
        classification: "Estado operativo: sin insight accionable.",
        recommend: "Validar integraciones y volver a ejecutar el análisis.",
      }),
    },
  ];
}

export async function generateInsights(): Promise<CopilotInsightItem[]> {
  const date = todayEsUy();

  let invoices: Record<string, unknown>[];
  let payments: PaymentRow[];
  let companies: Record<string, unknown>[];

  try {
    const batch = await loadInsightEngineProtoRows(supabase);
    invoices = batch.invoices;
    payments = batch.payments as PaymentRow[];
    companies = batch.companies;
  } catch {
    return stampComputedAt(emptyInsight(date));
  }

  if (invoices.length === 0 && payments.length === 0 && companies.length === 0) {
    return stampComputedAt(emptyInsight(date));
  }

  const names = buildCompanyNameMap(companies);
  const insights: CopilotInsightItem[] = [];

  const debtRows: DebtByCompanyRow[] = (() => {
    const byCompany = new Map<string, number>();
    for (const inv of invoices) {
      const status = String(inv.status ?? "").toLowerCase().trim();
      if (!INVOICE_DEBT_STATUSES.has(status)) continue;
      const cid = inv.company_id != null ? String(inv.company_id) : "";
      if (!cid) continue;
      const bal = toNumber(inv.balance_amount);
      byCompany.set(cid, (byCompany.get(cid) ?? 0) + bal);
    }
    return [...byCompany.entries()].map(([company_id, debt]) => ({
      company_id,
      company_name: names.get(company_id) ?? company_id,
      debt,
    }));
  })();

  const today = startOfTodayUtc();
  const overdueList: OverdueInvoiceRow[] = [];
  const overdueByCompany = new Map<string, number>();

  for (const inv of invoices) {
    const bal = toNumber(inv.balance_amount);
    if (bal <= 0) continue;
    const due = inv.due_date != null ? String(inv.due_date) : "";
    const d = parseDay(due);
    if (!d || d >= today) continue;
    const row = inv as OverdueInvoiceRow;
    overdueList.push(row);
    const cid = row.company_id != null ? String(row.company_id) : "";
    if (cid) overdueByCompany.set(cid, (overdueByCompany.get(cid) ?? 0) + 1);
  }

  const revenueRows: RevenueByCompanyRow[] = (() => {
    const byCompany = new Map<string, number>();
    for (const inv of invoices) {
      const cid = inv.company_id != null ? String(inv.company_id) : "";
      if (!cid) continue;
      const total = toNumber(inv.total_amount);
      byCompany.set(cid, (byCompany.get(cid) ?? 0) + total);
    }
    return [...byCompany.entries()].map(([company_id, revenue]) => ({
      company_id,
      company_name: names.get(company_id) ?? company_id,
      revenue,
    }));
  })();

  const totalRevenue = revenueRows.reduce((s, r) => s + r.revenue, 0);

  const now = new Date();
  const last30Start = new Date(now);
  last30Start.setUTCDate(last30Start.getUTCDate() - 30);
  const prev30Start = new Date(last30Start);
  prev30Start.setUTCDate(prev30Start.getUTCDate() - 30);
  const prev30End = new Date(last30Start);
  prev30End.setUTCMilliseconds(prev30End.getUTCMilliseconds() - 1);

  const last30Sum = sumPaymentsInWindow(payments, last30Start, now);
  const prev30Sum = sumPaymentsInWindow(payments, prev30Start, prev30End);

  for (const row of debtRows) {
    if (row.debt <= DEBT_CRITICAL_THRESHOLD) continue;
    const od = overdueByCompany.get(row.company_id) ?? 0;
    const title =
      od > 0
        ? `${row.company_name} concentra $${formatMoneyEs(row.debt)} en deuda pendiente y presenta ${od} factura${od === 1 ? "" : "s"} vencida${od === 1 ? "" : "s"}.`
        : `${row.company_name} concentra $${formatMoneyEs(row.debt)} en deuda pendiente (facturas emitidas / parciales / vencidas).`;

    const id = `eng-debt-${row.company_id}`;
    insights.push({
      id,
      title,
      priority: "Alta",
      category: "Riesgo",
      status: "Activo",
      date,
      evidence: buildEvidence({
        id,
        title,
        subtitle: `Saldo consolidado por empresa sobre facturas en estados: ${[...INVOICE_DEBT_STATUSES].join(", ")}.`,
        priority: "Alta",
        executive: title,
        relevance:
          "La deuda concentrada incrementa riesgo de liquidez y negociación si el cliente retrasa pagos.",
        impact: "Mayor exposición en cartera y posible necesidad de acciones de cobranza focalizadas.",
        pattern:
          "Suma de balance_amount agrupada por company_id dentro del subconjunto de facturas elegible.",
        evolution: `Análisis sobre hasta ${ROW_LIMIT} facturas más recientes en proto_invoices.`,
        indicators: [
          {
            label: "Deuda consolidada",
            value: `$ ${formatMoneyEs(row.debt)}`,
            severity: "high",
          },
          {
            label: "Facturas vencidas (empresa)",
            value: String(od),
            severity: od > 0 ? "high" : "medium",
          },
          {
            label: "Umbral crítico",
            value: `$ ${formatMoneyEs(DEBT_CRITICAL_THRESHOLD)}`,
            severity: "medium",
          },
        ],
        signals: overdueList
          .filter((inv) => String(inv.company_id ?? "") === row.company_id)
          .slice(0, 4)
          .map((inv) => ({
            label: "Factura vencida",
            detail: `Nº ${String(inv.invoice_number ?? inv.id ?? "—")} · saldo $ ${formatMoneyEs(toNumber(inv.balance_amount))}`,
            date: String(inv.due_date ?? date),
            severity: "high" as CopilotSeverity,
          })),
        conclusion:
          "El motor identifica concentración de deuda por encima del umbral operativo definido.",
        classification: "Clasificado como riesgo alto por monto absoluto de saldo pendiente.",
        recommend: "Revisar plan de cobranza, condiciones comerciales y exposición máxima por cliente.",
      }),
    });
  }

  if (overdueList.length > 0) {
    const topCompany = [...overdueByCompany.entries()].sort((a, b) => b[1] - a[1])[0];
    const topName = topCompany
      ? names.get(topCompany[0]) ?? topCompany[0]
      : "Cartera";
    const topCount = topCompany ? topCompany[1] : overdueList.length;
    const title = `Se detectaron ${overdueList.length} factura${overdueList.length === 1 ? "" : "s"} vencida${overdueList.length === 1 ? "" : "s"} con saldo pendiente; ${topName} concentra ${topCount}.`;

    const id = "eng-overdue";
    insights.push({
      id,
      title,
      priority: "Alta",
      category: "Cobranza",
      status: "En seguimiento",
      date,
      evidence: buildEvidence({
        id,
        title,
        subtitle: "Criterio: due_date anterior a hoy y balance_amount > 0.",
        priority: "Alta",
        executive: title,
        relevance: "Las facturas vencidas son señal directa de riesgo de cobro y working capital.",
        impact: "Afecta proyección de caja y puede requerir priorización comercial/cobranzas.",
        pattern: "Agrupación por vencimiento y saldo residual en facturas del dataset consultado.",
        evolution: `Total vencidas en muestra: ${overdueList.length} (hasta ${ROW_LIMIT} facturas).`,
        indicators: [
          {
            label: "Facturas vencidas",
            value: String(overdueList.length),
            severity: "high",
          },
          {
            label: "Mayor concentración (empresa)",
            value: topCompany ? `${topName} (${topCount})` : "—",
            severity: "high",
          },
        ],
        signals: overdueList.slice(0, 5).map((inv, i) => ({
          label: `Vencida ${i + 1}`,
          detail: `Cliente ${names.get(String(inv.company_id ?? "")) ?? String(inv.company_id ?? "—")} · ${String(inv.invoice_number ?? inv.id ?? "—")}`,
          date: String(inv.due_date ?? date),
          amount: `$ ${formatMoneyEs(toNumber(inv.balance_amount))}`,
          severity: "high" as CopilotSeverity,
        })),
        conclusion: "Hay obligaciones vencidas con saldo: requiere seguimiento operativo.",
        classification: "Prioridad alta por combinación de mora y saldo abierto.",
        recommend: "Contactar cuentas afectadas y actualizar estados de cobro en el ERP/proto.",
      }),
    });
  }

  if (prev30Sum > 0 && last30Sum < PAYMENT_DROP_RATIO * prev30Sum) {
    const id = "eng-payments-drop";
    const title = `Caída de ingresos cobrados: los últimos 30 días suman $${formatMoneyEs(last30Sum)} vs $${formatMoneyEs(prev30Sum)} en el período previo equivalente.`;

    insights.push({
      id,
      title,
      priority: "Media",
      category: "Liquidez",
      status: "En seguimiento",
      date,
      evidence: buildEvidence({
        id,
        title,
        subtitle: "Comparación de suma de amount en proto_payments entre ventanas de 30 días.",
        priority: "Media",
        executive: title,
        relevance:
          "La dinámica de cobros recientes anticipa presión de caja aunque la facturación sea estable.",
        impact: "Puede señalar desalineación entre ventas registradas y efectivo percibido.",
        pattern: `Últimos 30 días < ${PAYMENT_DROP_RATIO * 100}% del tramo previo de 30 días.`,
        evolution: `Ventana actual: $ ${formatMoneyEs(last30Sum)} · previa: $ ${formatMoneyEs(prev30Sum)}.`,
        indicators: [
          {
            label: "Pagos últimos 30 días",
            value: `$ ${formatMoneyEs(last30Sum)}`,
            severity: "medium",
          },
          {
            label: "Pagos 30 días previos",
            value: `$ ${formatMoneyEs(prev30Sum)}`,
            severity: "medium",
          },
          {
            label: "Ratio observado",
            value: formatPct(prev30Sum > 0 ? last30Sum / prev30Sum : 0),
            severity: "medium",
          },
        ],
        signals: [],
        conclusion: "El flujo de cobros reciente está por debajo del tramo inmediatamente anterior.",
        classification: "Clasificado como riesgo medio por caída relativa de pagos.",
        recommend: "Revisar calendario de cobros, mora y pipeline de facturación vs cobranza.",
      }),
    });
  }

  if (totalRevenue > 0) {
    for (const r of revenueRows) {
      const share = r.revenue / totalRevenue;
      if (share <= REVENUE_SHARE_DOMINANCE) continue;
      const id = `eng-revenue-${r.company_id}`;
      const title = `${r.company_name} representa el ${formatPct(share)} de la facturación total analizada (${formatMoneyEs(r.revenue)} de ${formatMoneyEs(totalRevenue)}).`;

      insights.push({
        id,
        title,
        priority: "Alta",
        category: "Riesgo",
        status: "Activo",
        date,
        evidence: buildEvidence({
          id,
          title,
          subtitle: "Participación de total_amount por empresa sobre el agregado del dataset.",
          priority: "Alta",
          executive: title,
          relevance: "Alta dependencia de un cliente reduce opciones de negociación y amplifica shocks.",
          impact: "Pérdida o reducción de ese cliente impacta de forma desproporcionada el resultado.",
          pattern: `Umbral de dominancia: > ${formatPct(REVENUE_SHARE_DOMINANCE)} de facturación agregada.`,
          evolution: `Basado en hasta ${ROW_LIMIT} facturas recientes.`,
          indicators: [
            {
              label: "Share facturación",
              value: formatPct(share),
              severity: "high",
            },
            {
              label: "Facturación cliente",
              value: `$ ${formatMoneyEs(r.revenue)}`,
              severity: "high",
            },
            {
              label: "Facturación total (muestra)",
              value: `$ ${formatMoneyEs(totalRevenue)}`,
              severity: "medium",
            },
          ],
          signals: [],
          conclusion: "La cartera muestra dependencia relevante en un solo cliente respecto al total facturado.",
          classification: "Riesgo alto por concentración de ingresos.",
          recommend: "Plan de diversificación comercial y límites de exposición por cuenta.",
        }),
      });
    }
  }

  if (insights.length === 0) {
    if (invoices.length === 0 && payments.length === 0 && companies.length === 0) {
      return stampComputedAt(emptyInsight(date));
    }
    const id = "eng-no-rules";
    return stampComputedAt([
      {
        id,
        title:
          "Sin condiciones de riesgo activadas en la muestra analizada (umbrales y reglas vigentes).",
        priority: "Baja" as const,
        category: "Sistema",
        status: "Activo" as const,
        date,
        evidence: buildEvidence({
          id,
          title:
            "Sin condiciones de riesgo activadas en la muestra analizada (umbrales y reglas vigentes).",
          subtitle:
            "Hay registros en proto_* pero ninguna regla del motor superó el umbral configurado.",
          priority: "Baja",
          executive:
            "El motor evaluó deuda por empresa, facturas vencidas, dinámica de pagos y concentración de facturación sin disparar alertas.",
          relevance:
            "Útil para confirmar que la cartera y cobranzas están dentro de parámetros operativos definidos.",
          impact: "Sin acción automática sugerida desde este lote.",
          pattern: `Reglas: deuda > $${formatMoneyEs(DEBT_CRITICAL_THRESHOLD)}, vencidas con saldo, caída de pagos 30 vs 30 días, share facturación > ${formatPct(REVENUE_SHARE_DOMINANCE)}.`,
          evolution: `Muestra: hasta ${ROW_LIMIT} filas por tabla (facturas, pagos, empresas).`,
          indicators: [
            {
              label: "Facturas en muestra",
              value: String(invoices.length),
              severity: "low",
            },
            {
              label: "Pagos en muestra",
              value: String(payments.length),
              severity: "low",
            },
            {
              label: "Empresas en muestra",
              value: String(companies.length),
              severity: "low",
            },
          ],
          signals: [],
          conclusion: "No se requieren insights prioritarios con el dataset y política actual.",
          classification: "Estado estable según heurísticas del motor.",
          recommend: "Mantener monitoreo y revisar umbrales si el negocio cambia de escala.",
        }),
      },
    ]);
  }

  return stampComputedAt(insights);
}

/**
 * Reservado para futuro: derivar alertas operativas a partir de insights generados.
 */
export function generateAlertsFromInsights(_insights: CopilotInsightItem[]): unknown[] {
  return [];
}
