/**
 * COPILOT CLIENT DEBT STATUS — fuente única para el estado comercial del cliente.
 *
 * Regla Summer87: una factura impaga acumula atraso desde la fecha de emisión.
 * No existe vencimiento contractual separado en la operativa real, así que el
 * único insumo temporal es `issueDate`. Cualquier `due_date` (real o sintético)
 * NO se consulta en este motor.
 *
 * Estados:
 *   - current   ("Al día")    → debt total = 0 y sin facturas abiertas.
 *   - with_debt ("Con deuda") → 0–30 días desde emisión de la más antigua impaga.
 *   - delayed   ("Atrasado")  → 31–90 días desde emisión.
 *   - critical  ("Crítico")   → > 90 días desde emisión.
 *
 * Función pura. Sin React, sin I/O, sin timezone del navegador.
 * `today` default: hoy en UTC (YYYY-MM-DD).
 *
 * Etapa A — Helper + tests. No cablear todavía en UI/PDFs/reports.
 */

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type ClientDebtStatus = "current" | "with_debt" | "delayed" | "critical";

export const CLIENT_DEBT_STATUS_LABEL: Record<ClientDebtStatus, string> = {
  current: "Al día",
  with_debt: "Con deuda",
  delayed: "Atrasado",
  critical: "Crítico",
};

export type OpenInvoiceForStatus = {
  id: string;
  /** YYYY-MM-DD. Cadenas vacías o no parseables se ignoran para días. */
  issueDate: string;
  balanceAmount: number;
  currencyCode: "UYU" | "USD";
};

export type DeriveClientDebtStatusInput = {
  debtUyu: number;
  debtUsd: number;
  openInvoices: readonly OpenInvoiceForStatus[];
  /** YYYY-MM-DD; default = hoy en UTC. */
  today?: string;
};

export type DeriveClientDebtStatusOutput = {
  status: ClientDebtStatus;
  label: string;
  totalDebtByCurrency: { UYU: number; USD: number };
  openInvoicesCount: number;
  maxDaysSinceIssue: number;
  oldestOpenInvoiceIssueDate: string | null;
  reason: string;
};

// ---------------------------------------------------------------------------
// Constantes y utilidades
// ---------------------------------------------------------------------------

/** Epsilon financiero: saldos ≤ 0.005 se tratan como cero. */
const DEBT_EPSILON = 0.005;

/** Buckets de días desde emisión. */
const DELAYED_LOWER = 31;
const DELAYED_UPPER = 90;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeAmount(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  if (n <= DEBT_EPSILON) return 0;
  return n;
}

import { todayYmdMontevideo } from "@/lib/date/summer87-today";

/**
 * Fecha por defecto para clasificación comercial: hoy en Montevideo.
 * Toda decisión de status (Al día / Con deuda / Atrasado / Crítico) debe
 * medirse contra esta fecha. Call sites pueden inyectar `today` explícito
 * (server-rendered, snapshots históricos), pero el fallback siempre es UY.
 */
function defaultToday(): string {
  return todayYmdMontevideo();
}

/**
 * @deprecated CLIENT-DEBT-SEMANTICS-001 Etapa C: usar `todayYmdMontevideo`
 * de `lib/date/summer87-today`. Alias preservado para call sites que aún no
 * migraron y para tests.
 */
export function localTodayYmd(): string {
  return todayYmdMontevideo();
}

/** Convierte YYYY-MM-DD a ms UTC (mediodía para evitar DST). null si inválido. */
function parseYmdToUtcMs(ymd: string): number | null {
  if (typeof ymd !== "string") return null;
  const s = ymd.length >= 10 ? ymd.slice(0, 10) : ymd;
  if (!YMD_RE.test(s)) return null;
  const ms = Date.parse(`${s}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function diffWholeDaysUtc(fromYmd: string, toYmd: string): number | null {
  const a = parseYmdToUtcMs(fromYmd);
  const b = parseYmdToUtcMs(toYmd);
  if (a === null || b === null) return null;
  return Math.floor((b - a) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

export function deriveClientDebtStatus(
  input: DeriveClientDebtStatusInput
): DeriveClientDebtStatusOutput {
  const today =
    typeof input.today === "string" && YMD_RE.test(input.today.slice(0, 10))
      ? input.today.slice(0, 10)
      : defaultToday();

  const debtUyu = normalizeAmount(input.debtUyu);
  const debtUsd = normalizeAmount(input.debtUsd);

  // Filtrar facturas con saldo realmente abierto.
  const openInvoices = (input.openInvoices ?? []).filter(
    (inv) => normalizeAmount(inv.balanceAmount) > 0
  );
  const openInvoicesCount = openInvoices.length;

  const totalDebtByCurrency = { UYU: debtUyu, USD: debtUsd };
  const totalDebt = debtUyu + debtUsd;

  // 1) Sin deuda: cero por totales y por facturas abiertas.
  if (totalDebt === 0 && openInvoicesCount === 0) {
    return {
      status: "current",
      label: CLIENT_DEBT_STATUS_LABEL.current,
      totalDebtByCurrency,
      openInvoicesCount: 0,
      maxDaysSinceIssue: 0,
      oldestOpenInvoiceIssueDate: null,
      reason: "sin deuda abierta",
    };
  }

  // 2) Hay deuda. Calcular días desde emisión sobre las facturas con fecha parseable.
  let maxDaysSinceIssue = 0;
  let oldestIssueDate: string | null = null;
  let parsedCount = 0;

  for (const inv of openInvoices) {
    const days = diffWholeDaysUtc(inv.issueDate, today);
    if (days === null) continue;
    parsedCount++;

    // Fechas futuras por error: tratar como 0 días.
    const safeDays = days < 0 ? 0 : days;
    if (safeDays > maxDaysSinceIssue) maxDaysSinceIssue = safeDays;

    const issueYmd = inv.issueDate.slice(0, 10);
    if (oldestIssueDate === null || issueYmd < oldestIssueDate) {
      oldestIssueDate = issueYmd;
    }
  }

  // 3) Deuda por totales pero sin facturas abiertas en el input.
  if (openInvoicesCount === 0) {
    return {
      status: "with_debt",
      label: CLIENT_DEBT_STATUS_LABEL.with_debt,
      totalDebtByCurrency,
      openInvoicesCount: 0,
      maxDaysSinceIssue: 0,
      oldestOpenInvoiceIssueDate: null,
      reason: "deuda abierta sin facturas disponibles",
    };
  }

  // 4) Hay facturas abiertas pero ninguna con fecha de emisión parseable.
  if (parsedCount === 0) {
    return {
      status: "with_debt",
      label: CLIENT_DEBT_STATUS_LABEL.with_debt,
      totalDebtByCurrency,
      openInvoicesCount,
      maxDaysSinceIssue: 0,
      oldestOpenInvoiceIssueDate: null,
      reason: "deuda abierta sin fecha de emisión suficiente",
    };
  }

  // 5) Clasificar por bucket de días desde emisión.
  let status: ClientDebtStatus;
  let reason: string;
  if (maxDaysSinceIssue <= 30) {
    status = "with_debt";
    reason = "deuda 0–30 días desde emisión";
  } else if (maxDaysSinceIssue <= DELAYED_UPPER) {
    status = "delayed";
    reason = `deuda ${DELAYED_LOWER}–${DELAYED_UPPER} días desde emisión`;
  } else {
    status = "critical";
    reason = `deuda > ${DELAYED_UPPER} días desde emisión`;
  }

  return {
    status,
    label: CLIENT_DEBT_STATUS_LABEL[status],
    totalDebtByCurrency,
    openInvoicesCount,
    maxDaysSinceIssue,
    oldestOpenInvoiceIssueDate: oldestIssueDate,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Adaptador para portfolio rows (ClientPortfolioRow / ClientCompanyDetail)
// ---------------------------------------------------------------------------

/**
 * Insumo mínimo del portfolio para evaluar el status de un cliente.
 * Pensado para envolver `ClientPortfolioRow` sin importar ese tipo (mantiene
 * el helper independiente de la capa de datos).
 */
export type PortfolioDebtStatusInput = {
  debt_uyu?: number | null;
  debt_usd?: number | null;
  /**
   * YYYY-MM-DD de la factura impaga más antigua (cualquier moneda). null/undef
   * si no se pudo computar al construir el portfolio.
   */
  oldest_open_invoice_issue_date?: string | null;
  /** Conteo de facturas con balance > 0 (cualquier moneda). */
  open_invoices_count?: number | null;
};

/**
 * Envuelve `deriveClientDebtStatus` para call sites que solo tienen un
 * `ClientPortfolioRow` con campos derivados precomputados.
 *
 * Convierte el row en un set sintético de `openInvoices` con un único item
 * que lleva la fecha más antigua y el balance total. Esto es suficiente
 * porque el helper solo necesita `max(today − issueDate)` y `count`.
 */
export function derivePortfolioDebtStatus(
  row: PortfolioDebtStatusInput,
  options: { today?: string } = {}
): DeriveClientDebtStatusOutput {
  const debtUyu = typeof row.debt_uyu === "number" ? row.debt_uyu : 0;
  const debtUsd = typeof row.debt_usd === "number" ? row.debt_usd : 0;
  const oldest =
    typeof row.oldest_open_invoice_issue_date === "string" &&
    row.oldest_open_invoice_issue_date.length >= 10
      ? row.oldest_open_invoice_issue_date.slice(0, 10)
      : null;
  const count =
    typeof row.open_invoices_count === "number" && row.open_invoices_count > 0
      ? Math.floor(row.open_invoices_count)
      : 0;

  const synthetic: OpenInvoiceForStatus[] = [];
  if (count > 0) {
    // Item portador de la fecha más antigua (puede faltar).
    synthetic.push({
      id: "synthetic-oldest",
      issueDate: oldest ?? "",
      balanceAmount: Math.max(debtUyu + debtUsd, 1),
      currencyCode: debtUyu >= debtUsd ? "UYU" : "USD",
    });
    // Pad con ítems sin fecha para reflejar el count real al motor.
    for (let i = 1; i < count; i++) {
      synthetic.push({
        id: `synthetic-${i}`,
        issueDate: "",
        balanceAmount: 1,
        currencyCode: "UYU",
      });
    }
  }

  return deriveClientDebtStatus({
    debtUyu,
    debtUsd,
    openInvoices: synthetic,
    today: options.today,
  });
}
