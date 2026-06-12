/**
 * Derivaciones puras para Finanzas — CEO Edition.
 * Sin I/O, sin React. Recibe arrays ya cargados de invoices/receipts/portfolio.
 * Rankings siempre por moneda — nunca consolidar UYU/USD.
 */

import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type CurrencyCode = "UYU" | "USD";

export type MonthlySalesRow = {
  /** YYYY-MM (acumulación natural por mes). */
  ym: string;
  /** Mes corto en español (ENE, FEB, …). */
  monthShortEs: string;
  /** Ventas netas (facturas no-NC menos NC), por moneda. */
  sales: { UYU: number; USD: number };
  /** Si el mes ya está cerrado (no es el mes calendario en curso). */
  closed: boolean;
};

export type CeoDebtorRow = {
  companyId: string;
  name: string;
  amount: number;
};

/** Indicadores agregados de cartera — sin rankings cross-moneda. */
export type CeoIndicators = {
  totalClientsWithOverdue: number;
  totalClients: number;
  overdueAmount: { UYU: number; USD: number };
  clientsOver30: number;
};

// ---------------------------------------------------------------------------
// Inputs mínimos
// ---------------------------------------------------------------------------

export type CeoInvoiceInput = {
  company_id?: string | null;
  issue_date?: unknown;
  currency_code?: unknown;
  total_amount?: unknown;
  is_active?: unknown;
  status?: unknown;
  zeta_metadata?: unknown;
};

export type CeoPortfolioRow = {
  company_id: string;
  name?: string | null;
  debt_uyu?: number;
  debt_usd?: number;
  overdue_uyu?: number;
  overdue_usd?: number;
  overdue_debt?: number;
  overdue_days?: number;
  has_contact_data?: boolean;
  risk?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_SHORT_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"] as const;

function ymdYear(iso: unknown): number | null {
  if (iso == null) return null;
  const s = String(iso).trim();
  if (s.length < 4) return null;
  const y = Number.parseInt(s.slice(0, 4), 10);
  if (!Number.isFinite(y)) return null;
  return y;
}

function ymdMonth(iso: unknown): number | null {
  if (iso == null) return null;
  const s = String(iso).trim();
  if (s.length < 7) return null;
  const m = Number.parseInt(s.slice(5, 7), 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function currencyOf(code: unknown): CurrencyCode | null {
  const c = String(code ?? "").trim().toUpperCase();
  if (c === "UYU" || c === "USD") return c;
  return null;
}

function isVoided(inv: CeoInvoiceInput): boolean {
  const st = String(inv.status ?? "").trim().toLowerCase();
  if (st === "void" || st === "cancelled" || st === "anulada") return true;
  return false;
}

function debtField(currency: CurrencyCode): "debt_uyu" | "debt_usd" {
  return currency === "UYU" ? "debt_uyu" : "debt_usd";
}

// ---------------------------------------------------------------------------
// Facturación mensual (año fiscal calendario)
// ---------------------------------------------------------------------------

export function buildMonthlySalesYear(
  invoices: ReadonlyArray<CeoInvoiceInput>,
  year: number,
  asOf: Date
): MonthlySalesRow[] {
  const buckets = new Map<number, { UYU: number; USD: number }>();
  for (let m = 1; m <= 12; m += 1) {
    buckets.set(m, { UYU: 0, USD: 0 });
  }

  for (const inv of invoices) {
    if (isVoided(inv)) continue;
    if (inv.is_active === false) continue;
    const y = ymdYear(inv.issue_date);
    const m = ymdMonth(inv.issue_date);
    if (y !== year || m == null) continue;
    const cur = currencyOf(inv.currency_code);
    if (!cur) continue;
    const total = num(inv.total_amount);
    if (total <= 0) continue;
    const bucket = buckets.get(m)!;
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) {
      bucket[cur] -= total;
    } else {
      bucket[cur] += total;
    }
  }

  const currentYear = asOf.getUTCFullYear();
  const currentMonth = asOf.getUTCMonth() + 1;

  return Array.from(buckets.entries()).map(([m, sales]) => ({
    ym: `${year}-${String(m).padStart(2, "0")}`,
    monthShortEs: MONTH_SHORT_ES[m - 1],
    sales: { UYU: Math.max(0, sales.UYU), USD: Math.max(0, sales.USD) },
    closed: year < currentYear || (year === currentYear && m < currentMonth),
  }));
}

// ---------------------------------------------------------------------------
// Deudores por moneda (ranking separado UYU / USD)
// ---------------------------------------------------------------------------

export function topDebtorsByCurrency(
  portfolioRows: ReadonlyArray<CeoPortfolioRow>,
  currency: CurrencyCode,
  limit = 5
): CeoDebtorRow[] {
  const field = debtField(currency);
  return portfolioRows
    .filter((r) => num(r[field]) > 0)
    .slice()
    .sort((a, b) => num(b[field]) - num(a[field]))
    .slice(0, limit)
    .map((r) => ({
      companyId: r.company_id,
      name: r.name ?? r.company_id,
      amount: num(r[field]),
    }));
}

export function topDebtorByCurrency(
  portfolioRows: ReadonlyArray<CeoPortfolioRow>,
  currency: CurrencyCode
): CeoDebtorRow | null {
  return topDebtorsByCurrency(portfolioRows, currency, 1)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Indicadores CEO (agregados, sin consolidación cross-moneda)
// ---------------------------------------------------------------------------

export function buildCeoIndicators(
  portfolioRows: ReadonlyArray<CeoPortfolioRow>,
  _asOf: Date
): CeoIndicators {
  const withDebt = portfolioRows.filter(
    (r) => num(r.debt_uyu) > 0 || num(r.debt_usd) > 0
  );
  const withOverdue = withDebt.filter(
    (r) => num(r.overdue_uyu) > 0 || num(r.overdue_usd) > 0 || num(r.overdue_debt) > 0
  );
  const over30 = withOverdue.filter((r) => num(r.overdue_days) >= 30);

  return {
    totalClientsWithOverdue: withOverdue.length,
    totalClients: portfolioRows.length,
    overdueAmount: {
      UYU: withOverdue.reduce((s, r) => s + num(r.overdue_uyu), 0),
      USD: withOverdue.reduce((s, r) => s + num(r.overdue_usd), 0),
    },
    clientsOver30: over30.length,
  };
}

// ---------------------------------------------------------------------------
// Facturación anual acumulada
// ---------------------------------------------------------------------------

export function buildAnnualSalesYtd(
  invoices: ReadonlyArray<CeoInvoiceInput>,
  year: number
): { UYU: number; USD: number } {
  let uyu = 0;
  let usd = 0;
  for (const inv of invoices) {
    if (isVoided(inv) || inv.is_active === false) continue;
    if (ymdYear(inv.issue_date) !== year) continue;
    const cur = currencyOf(inv.currency_code);
    if (!cur) continue;
    const total = num(inv.total_amount);
    if (total <= 0) continue;
    const sign = isCreditNoteFromMetadata(inv.zeta_metadata) ? -1 : 1;
    if (cur === "UYU") uyu += sign * total;
    else usd += sign * total;
  }
  return { UYU: Math.max(0, uyu), USD: Math.max(0, usd) };
}
