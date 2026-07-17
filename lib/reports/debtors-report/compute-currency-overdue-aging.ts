import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { isVoidedSaleStatus } from "@/lib/sales/canonical/issued-sale-universe";

export type OverdueAgingInvoiceInput = {
  balance_amount?: unknown;
  due_date?: unknown;
  issue_date?: unknown;
  status?: unknown;
  currency_code?: string | null;
  zeta_metadata?: unknown;
};

export type CurrencyOverdueAging = {
  oldestDueDate: string | null;
  overdueDays: number | null;
  usedIssueDateFallback: boolean;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ymd(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (s.length >= 10) return s.slice(0, 10);
  return "";
}

function currencyOf(code: string | null | undefined): "UYU" | "USD" | null {
  const raw = String(code ?? "").trim().toUpperCase();
  if (raw === "UYU" || raw === "USD") return raw;
  return null;
}

function ymdToUtcMs(ymdStr: string): number | null {
  if (!ymdStr || ymdStr.length < 10) return null;
  const [y, m, d] = ymdStr.slice(0, 10).split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

/** Días calendario entre dos fechas YYYY-MM-DD (later - earlier). */
export function differenceInCalendarDaysYmd(laterYmd: string, earlierYmd: string): number | null {
  const a = ymdToUtcMs(laterYmd);
  const b = ymdToUtcMs(earlierYmd);
  if (a == null || b == null) return null;
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function isPaidOrVoid(status: unknown): boolean {
  const st = String(status ?? "").toLowerCase().trim();
  // FASE D: conjunto canónico de anulados (cancelled/void/anulado/voided/…) + pagado.
  return st === "paid" || isVoidedSaleStatus(st);
}

/**
 * FASE 1B — Antigüedad de atraso por moneda desde `due_date` EXCLUSIVAMENTE.
 * Ya no existe respaldo por `issue_date`: `issue_date` es antigüedad de emisión,
 * no días de atraso. El saldo abierto sin `due_date` no se clasifica como
 * atrasado (queda como pendiente al día). `usedIssueDateFallback` se conserva en
 * el contrato pero es siempre `false` (deprecado).
 */
export function computeCurrencyOverdueAging(
  invoices: readonly OverdueAgingInvoiceInput[],
  currency: "UYU" | "USD",
  emittedAt: Date
): CurrencyOverdueAging {
  const emittedYmd = emittedAt.toISOString().slice(0, 10);

  let oldestDue: string | null = null;

  for (const inv of invoices) {
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) continue;
    if (currencyOf(inv.currency_code) !== currency) continue;
    const pending = num(inv.balance_amount);
    if (pending <= 0 || isPaidOrVoid(inv.status)) continue;

    const due = ymd(inv.due_date);
    // Solo due_date < corte cuenta como atrasado. Sin due_date ⇒ no atrasado.
    if (due !== "" && due < emittedYmd) {
      if (!oldestDue || due < oldestDue) oldestDue = due;
    }
  }

  if (!oldestDue) {
    return { oldestDueDate: null, overdueDays: null, usedIssueDateFallback: false };
  }

  const overdueDays = differenceInCalendarDaysYmd(emittedYmd, oldestDue);
  return {
    oldestDueDate: oldestDue,
    overdueDays: overdueDays != null && overdueDays >= 0 ? overdueDays : null,
    usedIssueDateFallback: false,
  };
}

export function formatOverdueDaysLabel(
  overdueDays: number | null,
  usedIssueDateFallback: boolean
): string {
  if (overdueDays == null) return "—";
  const suffix = usedIssueDateFallback ? " (desde emisión)" : "";
  return `${overdueDays} día${overdueDays === 1 ? "" : "s"}${suffix}`;
}

export function agingBadgeFromDays(overdueDays: number | null): string | null {
  if (overdueDays == null || overdueDays <= 0) return null;
  if (overdueDays >= 90) return "+90 días";
  if (overdueDays >= 60) return "+60 días";
  if (overdueDays >= 30) return "+30 días";
  return null;
}
