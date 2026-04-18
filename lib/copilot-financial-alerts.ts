import { normalizedCollectionProbability } from "@/lib/copilot-cashflow-engine";
import { mapTaxTypeLabel } from "@/lib/copilot-format";
import { financialEngineLocalTodayYmd, type FinancialSnapshot } from "@/lib/copilot-financial-engine";
import type { FiscalAlertItem, FiscalAlertPriority } from "@/lib/copilot-tax-alerts";
import { loadPredictiveFinancialAlertsDatasetRows } from "@/lib/data/proto-analytics-read-repository";
import { supabase } from "@/lib/supabase-client";

const TAX_HORIZON_DAYS = 30;

/** Reservado para extender el motor (p. ej. filtros por empresa) sin romper la firma. */
export interface FinancialPredictiveAlertsInput {
  // Intencionalmente vacío por ahora.
}

type PaymentRow = {
  id: unknown;
  amount: unknown;
  payment_date: unknown;
  category: unknown;
  obligation_id: unknown;
};

type TaxObligationRow = {
  id: unknown;
  due_date: unknown;
  estimated_amount: unknown;
  status: unknown;
  tax_type: unknown;
  period_label: unknown;
};

type TaxPaymentRow = {
  obligation_id: unknown;
  amount: unknown;
  status: unknown;
};

type InvoiceRow = { balance_amount: unknown; collection_probability: unknown };
type ReceiptRow = { amount: unknown };

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymdFromIso(iso: string): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysToYmd(ymd: string, days: number): string {
  const base = ymd.slice(0, 10);
  const parts = base.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return base;
  const [y, mo, da] = parts;
  const dt = new Date(y, mo - 1, da);
  if (Number.isNaN(dt.getTime())) return base;
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function sumReceiptAmounts(rows: ReceiptRow[]): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

function sumPaymentAmountsAll(rows: PaymentRow[]): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

function sumFutureOperationalPayments(rows: PaymentRow[], todayYmd: string): number {
  let t = 0;
  for (const r of rows) {
    const py = ymdFromIso(String(r.payment_date ?? ""));
    if (!py || py <= todayYmd) continue;
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

function sumExpectedInflowsOpenInvoices(rows: InvoiceRow[]): number {
  let t = 0;
  for (const inv of rows) {
    const bal = num(inv.balance_amount);
    if (bal <= 0) continue;
    const p = normalizedCollectionProbability(inv.collection_probability);
    t += bal * p;
  }
  return t;
}

function sumPaidForObligation(obligationId: string, payments: TaxPaymentRow[]): number {
  return payments.reduce((acc, p) => {
    if (String(p.obligation_id ?? "") !== obligationId) return acc;
    if (String(p.status ?? "").toLowerCase() !== "paid") return acc;
    return acc + num(p.amount);
  }, 0);
}

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function detailBlock(detected: string, why: string, action: string): string {
  return `Qué detectamos: ${detected}\n\nPor qué importa: ${why}\n\nQué conviene hacer: ${action}`;
}

/** Categorías de impuesto en pagos operativos (texto libre en BD). */
export function isTaxRelatedPaymentCategory(category: string): boolean {
  const c = category.trim().toLowerCase();
  if (!c) return false;
  if (c.includes("impuesto")) return true;
  if (c.includes("fiscal") && c.includes("pago")) return true;
  if (c === "impuestos operativos") return true;
  if (c.includes("dgi") || c.includes("bps") || c.includes("iva")) return true;
  return false;
}

type TimelineEvent = { ymd: string; amount: number };

async function loadPredictiveDataset(): Promise<{
  payments: PaymentRow[];
  obligations: TaxObligationRow[];
  taxPayments: TaxPaymentRow[];
  receipts: ReceiptRow[];
  invoices: InvoiceRow[];
}> {
  const raw = await loadPredictiveFinancialAlertsDatasetRows(supabase);

  return {
    payments: raw.payments as PaymentRow[],
    obligations: raw.obligations as TaxObligationRow[],
    taxPayments: raw.taxPayments as TaxPaymentRow[],
    receipts: raw.receipts as ReceiptRow[],
    invoices: raw.invoices as InvoiceRow[],
  };
}

function buildTimelineEvents(
  payments: PaymentRow[],
  obligations: TaxObligationRow[],
  taxPayments: TaxPaymentRow[],
  todayYmd: string
): TimelineEvent[] {
  const horizonEnd = addDaysToYmd(todayYmd, TAX_HORIZON_DAYS);
  const events: TimelineEvent[] = [];

  for (const r of payments) {
    const py = ymdFromIso(String(r.payment_date ?? ""));
    if (!py || py <= todayYmd) continue;
    const n = num(r.amount);
    if (n <= 0) continue;
    events.push({ ymd: py, amount: n });
  }

  for (const o of obligations) {
    const st = String(o.status ?? "").toLowerCase();
    if (st === "paid") continue;
    const id = String(o.id ?? "");
    const due = ymdFromIso(String(o.due_date ?? ""));
    if (!due) continue;
    const est = num(o.estimated_amount);
    const paid = sumPaidForObligation(id, taxPayments);
    const remaining = Math.max(0, est - paid);
    if (remaining <= 0) continue;

    const effectiveDue = due < todayYmd ? todayYmd : due;
    if (effectiveDue > horizonEnd) continue;

    events.push({ ymd: effectiveDue, amount: remaining });
  }

  return events;
}

function groupEventsByYmd(events: TimelineEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    m.set(e.ymd, (m.get(e.ymd) ?? 0) + e.amount);
  }
  return m;
}

function sumPendingTaxOutflowsWithinHorizon(
  obligations: TaxObligationRow[],
  taxPayments: TaxPaymentRow[],
  todayYmd: string
): number {
  const horizonEnd = addDaysToYmd(todayYmd, TAX_HORIZON_DAYS);
  let t = 0;
  for (const o of obligations) {
    const st = String(o.status ?? "").toLowerCase();
    if (st === "paid") continue;
    const due = ymdFromIso(String(o.due_date ?? ""));
    if (!due || due > horizonEnd) continue;
    const id = String(o.id ?? "");
    const est = num(o.estimated_amount);
    const paid = sumPaidForObligation(id, taxPayments);
    t += Math.max(0, est - paid);
  }
  return t;
}

function buildSnapshotFromDataset(
  ds: {
    payments: PaymentRow[];
    obligations: TaxObligationRow[];
    taxPayments: TaxPaymentRow[];
    receipts: ReceiptRow[];
    invoices: InvoiceRow[];
  },
  todayYmd: string
): FinancialSnapshot {
  const available_cash =
    sumReceiptAmounts(ds.receipts) - sumPaymentAmountsAll(ds.payments);
  const expected_inflows = sumExpectedInflowsOpenInvoices(ds.invoices);
  const futurePay = sumFutureOperationalPayments(ds.payments, todayYmd);
  const taxOut = sumPendingTaxOutflowsWithinHorizon(
    ds.obligations,
    ds.taxPayments,
    todayYmd
  );
  const expected_outflows = futurePay + taxOut;
  const projected_balance =
    available_cash + expected_inflows - expected_outflows;
  const numerator = available_cash + expected_inflows;
  const coverage_ratio =
    expected_outflows > 0
      ? numerator / expected_outflows
      : numerator >= 0
        ? 999
        : 0;

  let risk_level: FinancialSnapshot["risk_level"] = "low";
  if (expected_outflows <= 0) {
    risk_level = numerator >= 0 ? "low" : "critical";
  } else {
    const ratio = numerator / expected_outflows;
    if (ratio < 0.5) risk_level = "critical";
    else if (ratio < 0.8) risk_level = "high";
    else if (ratio < 1.2) risk_level = "medium";
    else risk_level = "low";
  }

  return {
    available_cash,
    expected_inflows,
    expected_outflows,
    projected_balance,
    coverage_ratio,
    risk_level,
  };
}

function alertDeficitBeforeDue(
  snapshot: FinancialSnapshot,
  payments: PaymentRow[],
  obligations: TaxObligationRow[],
  taxPayments: TaxPaymentRow[],
  todayYmd: string
): FiscalAlertItem | null {
  const liquidity =
    snapshot.available_cash + snapshot.expected_inflows;
  const events = buildTimelineEvents(payments, obligations, taxPayments, todayYmd);
  if (events.length === 0) {
    if (liquidity < 0) {
      return {
        id: "finpred:deficit-sin-calendario",
        title: "Liquidez proyectada en terreno negativo",
        priority: "critical",
        type: "liquidez",
        summary: `Con cobranzas esperadas y salidas ya modeladas, la caja neta queda en ${formatMoney(liquidity)} antes de incorporar más vencimientos.`,
        detail: detailBlock(
          "El saldo de caja más cobranzas ponderadas no alcanza a cubrir las salidas que el motor ya considera.",
          "Sin corrección, cualquier imprevisto o desvío de cobro profundiza el rojo de tesorería.",
          "Revisá facturas con mayor probabilidad de cobro, negociá plazos con proveedores y priorizá obligaciones fiscales en Finanzas."
        ),
        obligationId: null,
      };
    }
    return null;
  }

  const byDay = groupEventsByYmd(events);
  const sortedDays = [...byDay.keys()].sort();
  let running = liquidity;
  for (const d of sortedDays) {
    running -= byDay.get(d) ?? 0;
    if (running < 0) {
      return {
        id: "finpred:deficit-antes-vencimiento",
        title: "Déficit de caja antes de un vencimiento clave",
        priority: "critical",
        type: "liquidez",
        summary: `Tras descontar salidas programadas hasta el ${d}, la caja proyectada caería por debajo de cero (${formatMoney(running)}).`,
        detail: detailBlock(
          `Simulamos caja disponible más cobranza esperada y, en orden de fechas, egresos operativos futuros y obligaciones fiscales pendientes (horizonte ${TAX_HORIZON_DAYS} días). Antes o en ${d} el saldo queda negativo.`,
          "Si no movés fechas o entradas, podés quedar sin fondos para cumplir pagos puntuales o impuestos.",
          "Adelantá cobros, reprogramá egresos no críticos o reservá línea de tesorería; revisá la agenda en Finanzas y la vista de pagos."
        ),
        obligationId: null,
      };
    }
  }

  return null;
}

function alertAdjustedCoverage(snapshot: FinancialSnapshot): FiscalAlertItem | null {
  if (snapshot.expected_outflows <= 0) return null;
  if (snapshot.projected_balance < 0) return null;

  const r = snapshot.coverage_ratio;
  if (r >= 1 && r < 1.2) {
    const priority: FiscalAlertPriority = r < 1.08 ? "high" : "medium";
    return {
      id: "finpred:cobertura-ajustada",
      title: "Cobertura de tesorería ajustada",
      priority,
      type: "cobertura",
      summary: `El balance proyectado es positivo (${formatMoney(snapshot.projected_balance)}), pero el colchón frente a egresos esperados es estrecho (cobertura ${r.toFixed(2)}×).`,
      detail: detailBlock(
        "Los ingresos esperados alcanzan a cubrir salidas, pero sin margen holgado frente a desvíos de cobro o gastos imprevistos.",
        "Pequeños retrasos en cobranza o un egreso extra pueden volver a poner la caja en tensión.",
        "Mantené un colchón explícito, revisá probabilidades de cobro en facturas abiertas y monitoreá la semana en Alertas."
      ),
      obligationId: null,
    };
  }

  return null;
}

function alertOverdueRollup(
  obligations: TaxObligationRow[],
  taxPayments: TaxPaymentRow[],
  todayYmd: string
): FiscalAlertItem | null {
  const lines: string[] = [];
  for (const o of obligations) {
    const st = String(o.status ?? "").toLowerCase();
    if (st === "paid") continue;
    const due = ymdFromIso(String(o.due_date ?? ""));
    if (!due || due >= todayYmd) continue;
    const id = String(o.id ?? "");
    const paid = sumPaidForObligation(id, taxPayments);
    if (paid > 0.01) continue;
    const tipo = mapTaxTypeLabel(String(o.tax_type ?? ""));
    const per = String(o.period_label ?? "—");
    lines.push(`${tipo} · ${per} (vence ${due})`);
  }

  if (lines.length === 0) return null;

  const shown = lines.slice(0, 5).join("; ");
  const more = lines.length > 5 ? ` (+${lines.length - 5} más)` : "";

  return {
    id: "finpred:vencidas-sin-acreditacion-fiscal",
    title: "Obligaciones vencidas sin acreditación fiscal registrada",
    priority: "critical",
    type: "fiscalidad",
    summary: `${lines.length} obligación(es) con vencimiento pasado y sin pagos fiscales imputados en el sistema.`,
    detail: detailBlock(
      `Constatamos obligaciones no saldadas cuya fecha de vencimiento ya pasó y no hay pagos fiscales acreditados en el sistema. Ejemplos: ${shown}${more}.`,
      "Sin registro de pago fiscal queda expuesto el cumplimiento formal y la conciliación de caja con obligaciones.",
      "Registrá los pagos fiscales vinculados a cada obligación o actualizá el estado si ya fueron saldadas fuera del sistema."
    ),
    obligationId: null,
  };
}

function alertUnlinkedTaxPayments(payments: PaymentRow[]): FiscalAlertItem[] {
  const out: FiscalAlertItem[] = [];
  for (const r of payments) {
    const cat = String(r.category ?? "");
    if (!isTaxRelatedPaymentCategory(cat)) continue;
    const oid = String(r.obligation_id ?? "").trim();
    if (oid) continue;
    const id = String(r.id ?? "");
    if (!id) continue;
    const amount = num(r.amount);
    const when = ymdFromIso(String(r.payment_date ?? "")) || "—";
    out.push({
      id: `finpred:pago-sin-obligacion:${id}`,
      title: "Pago marcado como impuesto sin obligación vinculada",
      priority: "medium",
      type: "conciliacion",
      summary: `Pago del ${when} por ${formatMoney(amount)} (${cat}). Sin vínculo a una obligación fiscal.`,
      detail: detailBlock(
        "Hay un pago operativo clasificado en categoría de impuestos sin vínculo a una obligación fiscal en Datos.",
        "Sin vínculo, el motor no puede cerrar la obligación ni auditar cobertura contra calendario.",
        "Desde Datos → Pagos, asociá el pago a la obligación correspondiente o ajustá la categoría si no es un impuesto."
      ),
      obligationId: null,
    });
  }
  return out;
}

/**
 * Alertas predictivas (caja, cobertura, vencidas sin acreditación, conciliación de pagos).
 * Usa tablas proto_* reales con la misma lógica de horizonte que el snapshot de Finanzas.
 */
export async function getFinancialPredictiveAlerts(
  _input?: FinancialPredictiveAlertsInput
): Promise<FiscalAlertItem[]> {
  const ds = await loadPredictiveDataset();
  const todayYmd = financialEngineLocalTodayYmd();
  const snapAligned = buildSnapshotFromDataset(ds, todayYmd);

  const out: FiscalAlertItem[] = [];

  const deficit = alertDeficitBeforeDue(
    snapAligned,
    ds.payments,
    ds.obligations,
    ds.taxPayments,
    todayYmd
  );
  if (deficit) out.push(deficit);

  const coverage = alertAdjustedCoverage(snapAligned);
  if (coverage) out.push(coverage);

  const overdueRoll = alertOverdueRollup(ds.obligations, ds.taxPayments, todayYmd);
  if (overdueRoll) out.push(overdueRoll);

  out.push(...alertUnlinkedTaxPayments(ds.payments));

  const rank: Record<FiscalAlertPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
  };
  out.sort((a, b) => {
    const d = rank[a.priority] - rank[b.priority];
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  return out;
}
