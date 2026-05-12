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

type ExplainItem = {
  id: string;
  label: string;
  description: string;
  status: ExplainStatus;
  count?: number;
  icon: LucideIcon;
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildItems(
  report: FinancialConsistencyReport,
  selectedCurrency: CurrencyFilter
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
      } fuera del rango ${report.periodStart ?? "?"} → ${report.periodEnd ?? "?"}. No suman a los totales de esta vista.`,
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
      } con datos atrasados. Saldo pendiente estimado: ${stalePendingStr}. Puede no reflejar el estado real.`,
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

  // 4. Deuda histórica (pre-2026)
  const historical: ExcludedHistoricalSummary = report.excludedHistorical;
  const historicalPendingEntries = currencyList.filter(
    (c) => (historical.pendingByCurrency[c] ?? 0) > 0
  );

  if (report.mode === "period_only") {
    // En modo operativo: la deuda pre-2026 está deliberadamente excluida
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
  } else {
    // En modo all_outstanding: pre-2026 visible, puede merecer revisión
    if (gaps.pre2026InvoiceCount > 0) {
      items.push({
        id: "pre-2026",
        label: "Facturas pre-2026 incluidas",
        description: `${formatCarteraInteger(gaps.pre2026InvoiceCount)} factura${
          gaps.pre2026InvoiceCount === 1 ? "" : "s"
        } con fecha anterior al 01/01/2026 incluida${gaps.pre2026InvoiceCount === 1 ? "" : "s"} en el saldo. Verificar si corresponde mantenerlas abiertas.`,
        status: gaps.pre2026InvoiceCount > 5 ? "warn" : "info",
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

  // 5. Orphan warnings
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
      } marcadas con missing_count ≥ 1.${autoCloseNote}${pendingStr}`,
      status: orphanSummary.pending_auto_close > 0 ? "critical" : "warn",
      count: orphanSummary.warned,
      icon: AlertTriangle,
    });
  } else {
    items.push({
      id: "orphan-warnings",
      label: "Orphan warnings",
      description: "Sin facturas marcadas como huérfanas por el proceso de reconciliación.",
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

  return items;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ExplainabilityPanel({
  report,
  selectedCurrency = "all",
}: {
  report: FinancialConsistencyReport;
  selectedCurrency?: CurrencyFilter;
}) {
  const items = useMemo(
    () => buildItems(report, selectedCurrency),
    [report, selectedCurrency]
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
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
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
              Explicabilidad financiera
            </h3>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              Qué montos se excluyen de los totales y por qué · auditoría interna
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.1em]">
            {nonOkCount > 0 ? (
              <span className={hasWarnings ? "font-semibold text-amber-700" : "text-[var(--copilot-ink-muted)]"}>
                {nonOkCount} aviso{nonOkCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="text-emerald-700">✓ sin avisos</span>
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
            <ExplainItemRow key={item.id} item={item} reduce={!!reduce} />
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
  ok:       "text-emerald-600",
  info:     "text-sky-600",
  warn:     "text-amber-700",
  critical: "text-rose-700",
};

const STATUS_BADGE_CLASS: Record<ExplainStatus, string> = {
  ok:       "border-emerald-200 bg-emerald-50 text-emerald-800",
  info:     "border-sky-200    bg-sky-50    text-sky-800",
  warn:     "border-amber-200  bg-amber-50  text-amber-800",
  critical: "border-rose-200   bg-rose-50   text-rose-800",
};

const STATUS_BADGE_LABEL: Record<ExplainStatus, string> = {
  ok:       "✓",
  info:     "i",
  warn:     "⚠",
  critical: "⚠",
};

function ExplainItemRow({ item, reduce }: { item: ExplainItem; reduce: boolean }) {
  const Icon = item.icon;
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
