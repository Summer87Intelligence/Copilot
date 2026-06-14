/**
 * Helpers puros para el desglose de facturas en el panel expandido de deudores (Hoy).
 * Sin React, sin I/O — testeable en aislamiento.
 */

import type { ClientPortfolioInvoice } from "@/lib/copilot-clients-portfolio";
import { formatCopilotDate } from "@/lib/copilot-format";
import { ZETA_SALDOS_PENDIENTES_CATEGORY } from "@/lib/zeta/zeta-operational-debt-dedup";

/**
 * CLIENT-DEBT-SEMANTICS-001: estado a nivel factura individual.
 *  - "Con deuda" → impaga, 0–30 días desde emisión.
 *  - "Atrasada"  → impaga, 31–90 días desde emisión.
 *  - "Crítica"   → impaga, > 90 días desde emisión.
 *  - "Parcial"   → impaga con pago parcial dentro de 0–30 días.
 * Una factura con `balance_amount > 0` nunca puede ser "Al día".
 */
export type InvoiceStatusLabel = "Con deuda" | "Atrasada" | "Crítica" | "Parcial";

export type DebtBreakdownItem = {
  invoiceId: string;
  issueDate: string;
  dueDate: string;
  documentNumber: string;
  currency: "UYU" | "USD";
  originalAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  daysOverdue: number | null;
  status: InvoiceStatusLabel;
};

export type DebtBreakdownSummary = {
  totalPending: number;
  totalOverdue: number;
  totalCurrent: number;
  invoiceCount: number;
  overdueCount: number;
  currency: "UYU" | "USD";
};

export type DebtBreakdown = {
  items: DebtBreakdownItem[];
  summary: DebtBreakdownSummary;
  /** true when sum of invoice pending amounts differs from rowDeudaAmount by more than TOLERANCE */
  hasReconciliationGap: boolean;
  reconciliationGap: number;
};

const TOLERANCE = 1.0;

function isValidDate(d: string): boolean {
  return d !== "—" && d !== "" && d.length >= 10;
}

/**
 * CLIENT-DEBT-SEMANTICS-001: estado por días desde emisión.
 * `balance > 0` se asume (caller filtra). Una factura impaga nunca es "Al día".
 */
function classifyStatus(
  balance: number,
  total: number,
  issueDate: string,
  today: string
): InvoiceStatusLabel {
  const daysSinceIssue = isValidDate(issueDate)
    ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(issueDate)) / 86_400_000))
    : null;

  if (daysSinceIssue !== null && daysSinceIssue > 90) return "Crítica";
  if (daysSinceIssue !== null && daysSinceIssue >= 31) return "Atrasada";

  // 0–30 días o sin issueDate parseable: bucket "Con deuda" salvo pago parcial.
  if (total > 0 && balance < total * 0.99) return "Parcial";
  return "Con deuda";
}

/**
 * Días de atraso desde emisión (no desde due_date). Devuelve null si no hay
 * issue_date parseable.
 */
function calcDaysOverdue(issueDate: string, today: string): number | null {
  if (!isValidDate(issueDate)) return null;
  const days = Math.floor((Date.parse(today) - Date.parse(issueDate)) / 86_400_000);
  return days < 0 ? 0 : days;
}

function inferCurrency(inv: ClientPortfolioInvoice): "UYU" | "USD" | null {
  const raw = String(inv.currency_code ?? "").trim().toUpperCase();
  if (raw === "UYU" || raw === "USD") return raw;
  return null;
}

function isShadowRow(inv: ClientPortfolioInvoice): boolean {
  return String(inv.category ?? "").trim() === ZETA_SALDOS_PENDIENTES_CATEGORY;
}

/** CLIENT-DEBT-SEMANTICS-001: peso por severidad bajo nueva taxonomía. */
const STATUS_SORT_WEIGHT: Record<InvoiceStatusLabel, number> = {
  "Crítica": 3,
  "Atrasada": 2,
  "Parcial": 1,
  "Con deuda": 0,
};

function sortItems(items: DebtBreakdownItem[]): DebtBreakdownItem[] {
  return [...items].sort((a, b) => {
    const aW = STATUS_SORT_WEIGHT[a.status] ?? 0;
    const bW = STATUS_SORT_WEIGHT[b.status] ?? 0;
    if (bW !== aW) return bW - aW;
    const aDays = a.daysOverdue ?? 0;
    const bDays = b.daysOverdue ?? 0;
    if (bDays !== aDays) return bDays - aDays;
    if (b.pendingAmount !== a.pendingAmount) return b.pendingAmount - a.pendingAmount;
    return a.issueDate.localeCompare(b.issueDate);
  });
}

export function buildDebtBreakdown(
  invoices: readonly ClientPortfolioInvoice[],
  currency: "UYU" | "USD",
  today: string,
  rowDeudaAmount: number,
  _rowVencidoAmount: number | null
): DebtBreakdown {
  const items: DebtBreakdownItem[] = [];

  for (const inv of invoices) {
    if (isShadowRow(inv)) continue;
    if (inferCurrency(inv) !== currency) continue;
    if (inv.balance_amount <= 0) continue;

    const status = classifyStatus(inv.balance_amount, inv.total_amount, inv.issue_date, today);
    const daysOverdue = calcDaysOverdue(inv.issue_date, today);
    const isOverdueBucket = status === "Atrasada" || status === "Crítica";

    items.push({
      invoiceId: inv.id,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      documentNumber: inv.invoice_number,
      currency,
      originalAmount: inv.total_amount,
      pendingAmount: inv.balance_amount,
      overdueAmount: isOverdueBucket ? inv.balance_amount : 0,
      daysOverdue,
      status,
    });
  }

  const sorted = sortItems(items);
  const totalPending = sorted.reduce((s, i) => s + i.pendingAmount, 0);
  const totalOverdue = sorted.reduce((s, i) => s + i.overdueAmount, 0);
  const gap = Math.abs(totalPending - rowDeudaAmount);

  return {
    items: sorted,
    summary: {
      totalPending,
      totalOverdue,
      totalCurrent: totalPending - totalOverdue,
      invoiceCount: sorted.length,
      overdueCount: sorted.filter(
        (i) => i.status === "Atrasada" || i.status === "Crítica"
      ).length,
      currency,
    },
    hasReconciliationGap: gap > TOLERANCE,
    reconciliationGap: gap,
  };
}

/** Formats YYYY-MM-DD as DD/MM/YYYY for compact table display (es-UY). */
export function fmtDateShort(dateStr: string): string {
  if (!dateStr || dateStr === "—") return "—";
  return formatCopilotDate(dateStr, "compact");
}

/** Returns a local YYYY-MM-DD string (consistent with portfolio debt calculations). */
export function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
