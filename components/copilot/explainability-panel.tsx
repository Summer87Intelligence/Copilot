"use client";

/**
 * ExplainabilityPanel
 * -------------------
 * Panel de auditoría y transparencia financiera. Render-only:
 * explica por qué ciertos importes no aparecen en los totales de cartera.
 *
 * Fuente: report.gaps, report.totalInvoicesWithoutCurrency,
 *         report.orphanSummary, report.voidedInvoices.
 *
 * Sin cálculos financieros — solo lee subtotales del backend.
 */

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CalendarX,
  ChevronDown,
  CircleHelp,
  Clock,
  FileX2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  formatCarteraInteger,
  formatCarteraMoney,
} from "@/lib/copilot-cartera-format";
import type {
  ExcludedHistoricalSummary,
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import type { CurrencyFilter } from "@/components/copilot/financial-control-bar";

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type ExplainStatus = "ok" | "info" | "warn" | "critical";

type CreditNoteDetailLine = {
  currency: ReconciliationCurrencyCode;
  count: number;
  amount: number;
};

type ExplainItem = {
  id: string;
  label: string;
  description: string;
  status: ExplainStatus;
  count?: number;
  icon: LucideIcon;
  /** Si presente, habilita toggle "Ver detalle" con desglose inline. */
  expandableDetail?: {
    lines: CreditNoteDetailLine[];
    note: string;
  };
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildItems(
  report: FinancialConsistencyReport,
  selectedCurrency: CurrencyFilter,
  isPreSync: boolean,
): ExplainItem[] {
  const items: ExplainItem[] = [];
  const { gaps, totalInvoicesWithoutCurrency, orphanSummary, voidedInvoices } = report;
  const currencyList: ReconciliationCurrencyCode[] =
    selectedCurrency === "USD" || selectedCurrency === "UYU"
      ? [selectedCurrency]
      : ["USD", "UYU"];

  // 1. Facturas excluidas por período
  if (report.mode === "period_only" && gaps.invoicesExcludedByPeriodFilter > 0) {
    items.push({
      id: "period-exclusion",
      label: "Excluidas por período",
      description: `${formatCarteraInteger(gaps.invoicesExcludedByPeriodFilter)} factura${
        gaps.invoicesExcludedByPeriodFilter === 1 ? "" : "s"
      } fuera del rango ${report.periodStart ?? "—"} → ${report.periodEnd ?? "—"}. No suman a los totales de esta vista.`,
      status: gaps.invoicesExcludedByPeriodFilter > 10 ? "warn" : "info",
      count: gaps.invoicesExcludedByPeriodFilter,
      icon: CalendarX,
    });
  }

  // 2. Moneda desconocida
  if (totalInvoicesWithoutCurrency > 0) {
    items.push({
      id: "unknown-currency",
      label: "Moneda desconocida",
      description: `${formatCarteraInteger(totalInvoicesWithoutCurrency)} factura${
        totalInvoicesWithoutCurrency === 1 ? "" : "s"
      } sin currency_code válido (no USD ni UYU). No contribuyen a los totales de cartera.`,
      status: "warn",
      count: totalInvoicesWithoutCurrency,
      icon: CircleHelp,
    });
  } else {
    items.push({
      id: "unknown-currency",
      label: "Moneda desconocida",
      description: "Todas las facturas tienen currency_code reconocido (USD / UYU).",
      status: "ok",
      count: 0,
      icon: CircleHelp,
    });
  }

  // 3. Clientes con datos stale (saldo pendiente en riesgo)
  const stalePending = gaps.stalePendingByCurrency;
  const stalePendingEntries = currencyList.filter(
    (c) => (stalePending[c] ?? 0) > 0
  );

  if (gaps.clientsWithStaleData > 0 && stalePendingEntries.length > 0) {
    const stalePendingStr = stalePendingEntries
      .map((c) => formatCarteraMoney(c, stalePending[c] ?? 0, { fractionDigits: 0 }))
      .join(" · ");
    items.push({
      id: "stale-pending",
      label: "Saldo stale bajo observación",
      description: `${formatCarteraInteger(gaps.clientsWithStaleData)} cliente${
        gaps.clientsWithStaleData === 1 ? "" : "s"
      } con datos atrasados. Deuda actual estimada: ${stalePendingStr}. Puede no reflejar el estado real.`,
      status: "warn",
      count: gaps.clientsWithStaleData,
      icon: Clock,
    });
  } else if (gaps.clientsWithStaleData > 0) {
    items.push({
      id: "stale-pending",
      label: "Clientes stale (sin deuda abierta)",
      description: `${formatCarteraInteger(gaps.clientsWithStaleData)} cliente${
        gaps.clientsWithStaleData === 1 ? "" : "s"
      } con datos atrasados pero sin saldo pendiente registrado.`,
      status: "info",
      count: gaps.clientsWithStaleData,
      icon: Clock,
    });
  } else {
    items.push({
      id: "stale-pending",
      label: "Saldo stale",
      description: "Todos los clientes tienen datos recientes. Sin exposición stale detectada.",
      status: "ok",
      count: 0,
      icon: Clock,
    });
  }

  // 4. Deuda histórica (pre-2026) — solo visible cuando el período incluye datos pre-sync
  if (isPreSync) {
    const historical: ExcludedHistoricalSummary = report.excludedHistorical;
    const historicalPendingEntries = currencyList.filter(
      (c) => (historical.pendingByCurrency[c] ?? 0) > 0
    );

    if (report.mode === "period_only") {
      if (historical.invoiceCount > 0) {
        const pendingStr = historicalPendingEntries.length > 0
          ? ` Saldo histórico pendiente: ${historicalPendingEntries
              .map((c) => formatCarteraMoney(c, historical.pendingByCurrency[c] ?? 0, { fractionDigits: 0 }))
              .join(" · ")}.`
          : "";
        items.push({
          id: "pre-2026",
          label: "Deuda histórica excluida de esta vista",
          description: `${formatCarteraInteger(historical.invoiceCount)} factura${
            historical.invoiceCount === 1 ? "" : "s"
          } con fecha anterior al 01/01/2026 excluida${historical.invoiceCount === 1 ? "" : "s"} del período operativo.${pendingStr} Para verlas, cambiar a "Todo el historial".`,
          status: "info",
          count: historical.invoiceCount,
          icon: CalendarX,
        });
      } else {
        items.push({
          id: "pre-2026",
          label: "Deuda histórica",
          description: "Sin facturas previas a 2026 con saldo pendiente.",
          status: "ok",
          count: 0,
          icon: CalendarX,
        });
      }
    } else if (historical.invoiceCount > 0) {
      const pendingStr =
        historicalPendingEntries.length > 0
          ? ` Saldo histórico pendiente: ${historicalPendingEntries
              .map((c) =>
                formatCarteraMoney(c, historical.pendingByCurrency[c] ?? 0, {
                  fractionDigits: 0,
                })
              )
              .join(" · ")}.`
          : "";
      items.push({
        id: "pre-2026",
        label: "Deuda histórica excluida del saldo operativo",
        description: `${formatCarteraInteger(historical.invoiceCount)} factura${
          historical.invoiceCount === 1 ? "" : "s"
        } con fecha anterior al 01/01/2026 excluida${historical.invoiceCount === 1 ? "" : "s"} por política MIN_FINANCIAL_DATE.${pendingStr}`,
        status: "info",
        count: historical.invoiceCount,
        icon: CalendarX,
      });
    } else if (gaps.pre2026InvoiceCount > 0) {
      items.push({
        id: "pre-2026-leak",
        label: "Facturas pre-2026 en saldo operativo",
        description: `${formatCarteraInteger(gaps.pre2026InvoiceCount)} factura${
          gaps.pre2026InvoiceCount === 1 ? "" : "s"
        } con fecha anterior al 01/01/2026 aparece${gaps.pre2026InvoiceCount === 1 ? "" : "n"} en el saldo operativo. Revisar filtro MIN_FINANCIAL_DATE.`,
        status: "warn",
        count: gaps.pre2026InvoiceCount,
        icon: CalendarX,
      });
    } else {
      items.push({
        id: "pre-2026",
        label: "Facturas pre-2026",
        description: "Sin facturas previas a 2026 con saldo abierto en esta vista.",
        status: "ok",
        count: 0,
        icon: CalendarX,
      });
    }
  }

  // 4b. Notas de crédito — siempre visible si hay datos; para 2026+ explica el gap
  {
    const cnByCurrency = currencyList
      .map((c) => {
        const cur = report.currencies.find((cu) => cu.currencyCode === c);
        return cur && (cur.creditNoteCount ?? 0) > 0
          ? { currency: c, count: cur.creditNoteCount, amount: cur.creditNoteAmount }
          : null;
      })
      .filter((x): x is CreditNoteDetailLine => x !== null);
    const totalCNCount = cnByCurrency.reduce((s, x) => s + x.count, 0);

    if (totalCNCount > 0) {
      items.push({
        id: "credit-notes",
        label: "Ajustes aplicados",
        description:
          "Los ajustes de facturación reducen la deuda actual en Zeta, pero no se registran como recibos de caja. Por eso puede existir diferencia entre Ventas del período, Cobrado registrado y Deuda actual.",
        status: "info",
        count: totalCNCount,
        icon: SlidersHorizontal,
        expandableDetail: {
          lines: cnByCurrency,
          note: "No es un error: es una compensación contable, no un recibo de caja.",
        },
      });
    }
  }

  // 5. Orphan warnings
  const staleMeta = orphanSummary.stale_metadata ?? 0;
  if (orphanSummary.warned > 0) {
    const autoCloseNote =
      orphanSummary.pending_auto_close > 0
        ? ` · ${formatCarteraInteger(orphanSummary.pending_auto_close)} pendiente${orphanSummary.pending_auto_close === 1 ? "" : "s"} de cierre automático.`
        : "";
    const pendingEntries = currencyList.filter(
      (c) => (orphanSummary.warnedPendingByCurrency[c] ?? 0) > 0
    );
    const pendingStr =
      pendingEntries.length > 0
        ? ` Saldo en observación: ${pendingEntries.map((c) => formatCarteraMoney(c, orphanSummary.warnedPendingByCurrency[c] ?? 0)).join(" · ")}.`
        : "";
    items.push({
      id: "orphan-warnings",
      label: "Orphan warnings",
      description: `${formatCarteraInteger(orphanSummary.warned)} factura${
        orphanSummary.warned === 1 ? "" : "s"
      } con deuda abierta y missing_count ≥ 1.${autoCloseNote}${pendingStr}`,
      status: orphanSummary.pending_auto_close > 0 ? "critical" : "warn",
      count: orphanSummary.warned,
      icon: AlertTriangle,
    });
  } else {
    const staleNote =
      staleMeta > 0
        ? ` ${formatCarteraInteger(staleMeta)} con metadata obsoleta (auto-repair en cron).`
        : "";
    items.push({
      id: "orphan-warnings",
      label: "Orphan warnings",
      description: `Sin facturas huérfanas activas.${staleNote}`,
      status: "ok",
      count: 0,
      icon: AlertTriangle,
    });
  }

  // 6. Facturas anuladas (informativo)
  if (voidedInvoices > 0) {
    items.push({
      id: "voided",
      label: "Facturas anuladas (excluidas)",
      description: `${formatCarteraInteger(voidedInvoices)} factura${
        voidedInvoices === 1 ? "" : "s"
      } anulada${voidedInvoices === 1 ? "" : "s"} excluida${voidedInvoices === 1 ? "" : "s"} de todos los totales. Comportamiento correcto.`,
      status: "ok",
      count: voidedInvoices,
      icon: FileX2,
    });
  }

  // 7. Excluidas por política histórica MIN_FINANCIAL_DATE (< 2026-01-01)
  {
    const excInv = report.excludedByMinFinancialDateCount ?? 0;
    const excRec = report.excludedByMinFinancialDateReceiptCount ?? 0;
    if (excInv > 0 || excRec > 0) {
      const parts: string[] = [];
      if (excInv > 0)
        parts.push(
          `${formatCarteraInteger(excInv)} factura${excInv === 1 ? "" : "s"}`
        );
      if (excRec > 0)
        parts.push(
          `${formatCarteraInteger(excRec)} recibo${excRec === 1 ? "" : "s"}`
        );
      items.push({
        id: "min-financial-date",
        label: "Excluidas por política histórica (< 2026-01-01)",
        description: `${parts.join(" y ")} con fecha anterior al 01/01/2026 excluida${excInv + excRec === 1 ? "" : "s"} a nivel de query. No consumen cuota de carga ni afectan totales. Política MIN_FINANCIAL_DATE aplicada en backend.`,
        status: "info",
        count: excInv + excRec,
        icon: CalendarX,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ExplainabilityPanel({
  report,
  selectedCurrency = "all",
  isPreSync = false,
}: {
  report: FinancialConsistencyReport;
  selectedCurrency?: CurrencyFilter;
  /** Si true, el período incluye facturas pre-2026 — muestra contexto histórico. */
  isPreSync?: boolean;
}) {
  const items = useMemo(
    () => buildItems(report, selectedCurrency, isPreSync),
    [report, selectedCurrency, isPreSync]
  );
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  const hasWarnings = items.some((i) => i.status === "warn" || i.status === "critical");
  const nonOkCount = items.filter((i) => i.status !== "ok").length;

  return (
    <section
      aria-label="Panel de explicabilidad"
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-[var(--copilot-shadow)]"
    >
      <header
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); }
        }}
        className={[
          "flex flex-wrap items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none transition-colors hover:bg-[rgba(44,40,37,0.02)]",
          open ? "border-b border-[var(--copilot-border)] rounded-t-2xl" : "rounded-2xl",
        ].join(" ")}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
              hasWarnings
                ? "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]"
                : "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
            }`}
          >
            {hasWarnings ? (
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
          </span>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-[var(--copilot-ink)]">
              ¿Cómo se calcula esto?
            </h3>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              Qué montos se incluyen o excluyen de los totales y por qué
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.1em]">
            {nonOkCount > 0 ? (
              <span className={hasWarnings ? "font-semibold text-[var(--copilot-warning-text-strong)]" : "text-[var(--copilot-ink-muted)]"}>
                {nonOkCount} aviso{nonOkCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="text-[var(--copilot-success-text-strong)]">✓ sin avisos</span>
            )}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-[var(--copilot-ink-muted)] transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
            aria-hidden
          />
        </div>
      </header>

      {open && (
        <motion.ul
          className="divide-y divide-[var(--copilot-border)] p-2"
          initial={reduce ? false : "hidden"}
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04 } },
          }}
        >
          {items.map((item) => (
            <ExplainItemRow key={item.id} item={item} />
          ))}
        </motion.ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fila individual
// ---------------------------------------------------------------------------

const STATUS_ICON_CLASS: Record<ExplainStatus, string> = {
  ok:       "text-[var(--copilot-success-text)]",
  info:     "text-sky-600",
  warn:     "text-[var(--copilot-warning-text-strong)]",
  critical: "text-[var(--copilot-danger-text-strong)]",
};

const STATUS_BADGE_CLASS: Record<ExplainStatus, string> = {
  ok:       "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  info:     "border-sky-200    bg-sky-50    text-sky-800",
  warn:     "border-[var(--copilot-warning-border)]  bg-[var(--copilot-tone-warning-bg)]  text-[var(--copilot-warning-text-strong)]",
  critical: "border-[var(--copilot-danger-border)]   bg-[var(--copilot-tone-danger-bg)]   text-[var(--copilot-danger-text-strong)]",
};

const STATUS_BADGE_LABEL: Record<ExplainStatus, string> = {
  ok:       "✓",
  info:     "i",
  warn:     "⚠",
  critical: "⚠",
};

function ExplainItemRow({ item }: { item: ExplainItem }) {
  const Icon = item.icon;
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!item.expandableDetail;

  return (
    <motion.li
      variants={{
        hidden:   { opacity: 0, x: 4 },
        visible:  { opacity: 1, x: 0, transition: { duration: 0.18, ease: "easeOut" } },
      }}
      className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-3 py-2.5"
    >
      {/* Icon */}
      <span className={`mt-0.5 ${STATUS_ICON_CLASS[item.status]}`}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>

      {/* Content */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--copilot-ink)]">{item.label}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {item.description}
        </p>
        {hasDetail && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 transition-colors hover:text-sky-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/60 rounded-sm"
            >
              {expanded ? "Ocultar detalle" : "Ver detalle"}
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-150 ${expanded ? "rotate-0" : "-rotate-90"}`}
                aria-hidden
              />
            </button>
            {expanded && (
              <div className="mt-2 rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.025)] px-3 py-2.5 space-y-1.5">
                {item.expandableDetail!.lines.map(({ currency, count, amount }) => (
                  <div key={currency} className="flex items-baseline justify-between gap-4">
                    <span className="text-[11px] text-[var(--copilot-ink-muted)]">
                      {formatCarteraInteger(count)} NC {currency}
                    </span>
                    <span className="text-[11px] tabular-nums font-semibold text-[var(--copilot-ink)]">
                      {formatCarteraMoney(currency, amount, { fractionDigits: 0 })}
                    </span>
                  </div>
                ))}
                <p className="mt-1 border-t border-[var(--copilot-border)] pt-1.5 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]/70">
                  {item.expandableDetail!.note}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Badge */}
      <span
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] tabular-nums ${STATUS_BADGE_CLASS[item.status]}`}
        aria-label={`estado ${item.status}`}
      >
        {STATUS_BADGE_LABEL[item.status]}
        {item.count !== undefined && item.count > 0 ? (
          <span className="ml-1">{formatCarteraInteger(item.count)}</span>
        ) : null}
      </span>
    </motion.li>
  );
}
