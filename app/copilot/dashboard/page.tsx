"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  FileDown,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import { defaultHoyPeriodRange } from "@/lib/copilot-hoy-period";
import type { FinancialConsistencyReport } from "@/lib/copilot-financial-reconciliation";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";
import {
  parseTreasuryCashPositionJson,
  parseTreasuryScheduledSummaryJson,
} from "@/lib/treasury/treasury-api-parse";
import {
  determineDashboardState,
  extractActiveDebtClientRows,
  extractClientStates,
  extractDashboardCurrencyData,
  extractMonthlyPoint,
  extractRecentMovements,
  extractTopBillingForCurrency,
  extractTopDebtorsForCurrency,
  getMonthRangesForPeriod,
  type DashboardActiveDebtRow,
  type DashboardCurrencyData,
  type DashboardClientStates,
  type DashboardMonthlyPoint,
  type DashboardRecentMovement,
  type DashboardState,
} from "@/lib/copilot-dashboard-summary";
import { METRIC_LABEL } from "@/lib/copilot-financial-metrics-contract";
import {
  consolidateToUsd,
  formatExchangeRateLabel,
  roundUsd,
} from "@/lib/finance/currency-conversion";

const TABLE_INITIAL_ROWS = 10;

// ---------------------------------------------------------------------------
// CSS helpers
// ---------------------------------------------------------------------------

const C = {
  card: "rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-[var(--copilot-shadow)]",
  panel: "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60",
  ink: "text-[var(--copilot-ink)]",
  muted: "text-[var(--copilot-ink-muted)]",
  accent: "text-[var(--copilot-accent)]",
  border: "border-[var(--copilot-border)]",
  input:
    "rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-3 py-1.5 text-xs text-[var(--copilot-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--copilot-accent)]",
  btn: "inline-flex items-center gap-1.5 rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition",
  btnGhost:
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)] transition",
} as const;

// ---------------------------------------------------------------------------
// Number formatters
// ---------------------------------------------------------------------------

function fmtAmount(n: number, currency: string): string {
  const prefix = currency === "USD" ? "U$S " : "$ ";
  return `${prefix}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Chart: Vertical bar (CSS flex)
// ---------------------------------------------------------------------------

type BarData = { label: string; uyu?: number; usd?: number };

function VerticalBarChart({
  data,
  selectedCurrency,
  height = 120,
  emptyText = "Sin datos",
}: {
  data: BarData[];
  selectedCurrency: "all" | "UYU" | "USD";
  height?: number;
  emptyText?: string;
}) {
  const vals = data.flatMap((d) => [
    selectedCurrency !== "USD" ? (d.uyu ?? 0) : 0,
    selectedCurrency !== "UYU" ? (d.usd ?? 0) : 0,
  ]);
  const maxVal = Math.max(...vals, 1);

  if (maxVal === 0) {
    return (
      <p className={`py-6 text-center text-xs ${C.muted}`}>{emptyText}</p>
    );
  }

  const valueH = 24;
  const labelH = 14;
  const barH = height - valueH - labelH;
  const valueClass = `block w-full truncate text-center text-[9px] font-semibold leading-tight ${C.ink}`;

  return (
    <div className="flex items-end gap-0.5 overflow-hidden" style={{ height }}>
      {data.map((d, i) => {
        const uyuH =
          selectedCurrency !== "USD"
            ? Math.max(1, ((d.uyu ?? 0) / maxVal) * barH)
            : 0;
        const usdH =
          selectedCurrency !== "UYU"
            ? Math.max(1, ((d.usd ?? 0) / maxVal) * barH)
            : 0;
        const showUyu = selectedCurrency !== "USD" && (d.uyu ?? 0) > 0;
        const showUsd = selectedCurrency !== "UYU" && (d.usd ?? 0) > 0;
        return (
          <div
            key={i}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            style={{ height }}
          >
            <div
              className="flex w-full items-end gap-px"
              style={{ height: valueH + barH }}
            >
              {showUyu ? (
                <div className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: valueH + barH }}>
                  <span className={valueClass} title={fmtAmount(d.uyu ?? 0, "UYU")} aria-hidden={false}>
                    {fmtAmount(d.uyu ?? 0, "UYU")}
                  </span>
                  <div
                    className="mt-0.5 w-full rounded-t bg-[var(--copilot-accent)] opacity-90"
                    style={{ height: uyuH }}
                  />
                </div>
              ) : null}
              {showUsd ? (
                <div className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: valueH + barH }}>
                  <span className={valueClass} title={fmtAmount(d.usd ?? 0, "USD")} aria-hidden={false}>
                    {fmtAmount(d.usd ?? 0, "USD")}
                  </span>
                  <div
                    className="mt-0.5 w-full rounded-t bg-blue-500 opacity-80"
                    style={{ height: usdH }}
                  />
                </div>
              ) : null}
              {!showUyu && !showUsd ? (
                <div className="flex flex-1 flex-col justify-end" style={{ height: valueH + barH }}>
                  <span className={`${valueClass} text-[var(--copilot-ink-muted)]`}>0</span>
                  <div className="mt-0.5 w-full rounded-t bg-[var(--copilot-border)]" style={{ height: 2 }} />
                </div>
              ) : null}
            </div>
            <p
              className={`mt-0.5 w-full truncate text-center text-[9px] leading-tight ${C.muted}`}
            >
              {d.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart: Grouped bar (Ventas vs Cobros)
// ---------------------------------------------------------------------------

function GroupedBarChart({
  groups,
  height = 120,
}: {
  groups: { label: string; a: number; b: number; aLabel: string; bLabel: string }[];
  height?: number;
}) {
  const maxVal = Math.max(...groups.flatMap((g) => [g.a, g.b]), 1);
  const valueH = 24;
  const labelH = 14;
  const barH = height - valueH - labelH;
  const valueClass = `block w-full truncate text-center text-[9px] font-semibold leading-tight ${C.ink}`;

  return (
    <div className="flex items-end gap-1 overflow-hidden" style={{ height }}>
      {groups.map((g, i) => (
        <div
          key={i}
          className="flex min-w-0 flex-1 flex-col items-center justify-end"
          style={{ height }}
        >
          <div className="flex w-full items-end gap-0.5" style={{ height: valueH + barH }}>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: valueH + barH }}>
              <span className={valueClass} title={fmtAmount(g.a, g.label.startsWith("USD") ? "USD" : "UYU")}>{fmtAmount(g.a, g.label.startsWith("USD") ? "USD" : "UYU")}</span>
              <div
                className="mt-0.5 w-full rounded-t bg-[var(--copilot-accent)] opacity-90"
                style={{ height: Math.max(1, (g.a / maxVal) * barH) }}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: valueH + barH }}>
              <span className={valueClass} title={fmtAmount(g.b, g.label.startsWith("USD") ? "USD" : "UYU")}>{fmtAmount(g.b, g.label.startsWith("USD") ? "USD" : "UYU")}</span>
              <div
                className="mt-0.5 w-full rounded-t bg-emerald-400"
                style={{ height: Math.max(1, (g.b / maxVal) * barH) }}
              />
            </div>
          </div>
          <p className={`mt-0.5 truncate text-[9px] leading-tight ${C.muted}`}>
            {g.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart: Horizontal bar (Top debtors / Top billing)
// ---------------------------------------------------------------------------

function HorizontalBarChart({
  items,
  color = "var(--copilot-accent)",
  href,
  currency = "UYU",
}: {
  items: { label: string; value: number; id?: string }[];
  color?: string;
  href?: (id: string) => string;
  currency?: "UYU" | "USD";
}) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <p className={`py-4 text-center text-xs ${C.muted}`}>Sin datos</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const pct = (item.value / maxVal) * 100;
        const inner = (
          <div key={i} className="flex items-center gap-2">
            <p className={`w-24 shrink-0 truncate text-[10px] leading-tight ${C.muted}`} title={item.label}>
              {item.label}
            </p>
            <div className="relative flex-1 h-3.5 rounded-full overflow-hidden bg-[var(--copilot-border)]">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <p className={`w-[4.5rem] shrink-0 text-right text-[10px] font-semibold tabular-nums ${C.ink}`}>
              {fmtAmount(item.value, currency)}
            </p>
          </div>
        );
        if (href && item.id) {
          return (
            <Link key={i} href={href(item.id)} className="block hover:opacity-80 transition">
              {inner}
            </Link>
          );
        }
        return <div key={i}>{inner}</div>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart: Gauge bar (collection effectiveness)
// ---------------------------------------------------------------------------

function GaugeRow({
  label,
  value,
  currency,
}: {
  label: string;
  value: number | null;
  currency: string;
}) {
  if (value === null) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between">
          <p className={`text-xs ${C.muted}`}>{label}</p>
          <p className={`text-xs ${C.muted}`}>—</p>
        </div>
        <div className="h-2.5 w-full rounded-full bg-[var(--copilot-border)]" />
      </div>
    );
  }
  const pct = Math.round(value * 100);
  const barColor =
    pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <p className={`text-xs ${C.muted}`}>
          {label} <span className={`ml-1 text-[10px] ${C.muted}`}>{currency}</span>
        </p>
        <p className={`text-xs font-semibold ${C.ink}`}>{pct}%</p>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--copilot-border)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart: Simple area (cash projection)
// ---------------------------------------------------------------------------

function AreaSparkline({
  points,
  height = 60,
}: {
  points: { label: string; value: number }[];
  height?: number;
}) {
  if (points.length < 2) {
    return <p className={`py-4 text-center text-xs ${C.muted}`}>Sin datos de proyección</p>;
  }
  const W = 260;
  const H = height;
  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = points.map((p) => H - ((p.value - minV) / range) * H * 0.85 - H * 0.07);
  const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const area = `${xs[0]},${H} ${polyline} ${xs[xs.length - 1]},${H}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        aria-hidden
      >
        <defs>
          <linearGradient id="dash-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--copilot-accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--copilot-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#dash-area-grad)" />
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--copilot-accent)"
          strokeWidth="1.5"
        />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="var(--copilot-accent)" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between">
        {points.map((p, i) => (
          <p key={i} className={`text-[9px] ${C.muted}`}>
            {p.label}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  tooltip,
  uyuValue,
  usdValue,
  selectedCurrency,
  href,
  negative,
  secondary,
}: {
  title: string;
  tooltip: string;
  uyuValue: number;
  usdValue: number;
  selectedCurrency: "all" | "UYU" | "USD";
  href: string;
  negative?: boolean;
  secondary?: string;
}) {
  const showUYU = selectedCurrency !== "USD";
  const showUSD = selectedCurrency !== "UYU";
  const critClass = negative ? "text-red-600" : C.accent;
  return (
    <div className={`${C.card} flex flex-col gap-3 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold leading-tight ${C.ink}`}>{title}</p>
        <span title={tooltip} className={`shrink-0 cursor-help ${C.muted}`}>
          <Info className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="space-y-1">
        {showUYU && (
          <p className={`text-lg font-bold leading-tight tabular-nums ${negative && uyuValue < 0 ? "text-red-600" : C.ink}`}>
            {fmtAmount(uyuValue, "UYU")}
            <span className={`ml-1 text-[10px] font-normal ${C.muted}`}>UYU</span>
          </p>
        )}
        {showUSD && (
          <p className={`text-base font-semibold leading-tight tabular-nums ${negative && usdValue < 0 ? "text-red-600" : C.muted}`}>
            {fmtAmount(usdValue, "USD")}
            <span className={`ml-1 text-[9px] font-normal ${C.muted}`}>USD</span>
          </p>
        )}
      </div>
      {secondary && (
        <p className={`text-[10px] leading-tight ${C.muted}`}>{secondary}</p>
      )}
      <Link
        href={href}
        className={`mt-auto flex items-center gap-1 text-[10px] font-medium ${critClass} hover:underline`}
      >
        Ver detalle <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart section wrapper
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  subtitle,
  children,
  badge,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className={`${C.card} flex flex-col gap-3 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-xs font-semibold ${C.ink}`}>{title}</p>
          {subtitle && (
            <p className={`mt-0.5 text-[10px] ${C.muted}`}>{subtitle}</p>
          )}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function ChartLegend({
  selectedCurrency,
}: {
  selectedCurrency: "all" | "UYU" | "USD";
}) {
  return (
    <div className="flex gap-3">
      {selectedCurrency !== "USD" && (
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded-sm bg-[var(--copilot-accent)]" />
          <p className={`text-[10px] ${C.muted}`}>UYU</p>
        </div>
      )}
      {selectedCurrency !== "UYU" && (
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded-sm bg-blue-500" />
          <p className={`text-[10px] ${C.muted}`}>USD</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / loading states
// ---------------------------------------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--copilot-border)] ${className}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

function ExecutiveSummaryCard({
  state,
  currencyData,
  clientStates,
  periodLabel,
}: {
  state: DashboardState;
  currencyData: DashboardCurrencyData[];
  clientStates: DashboardClientStates;
  periodLabel: string;
}) {
  const uyu = currencyData.find((d) => d.currency === "UYU");
  const usd = currencyData.find((d) => d.currency === "USD");

  const stateConfig = {
    ok: {
      label: "Estable",
      icon: <CheckCircle className="h-4 w-4" />,
      bg: "bg-emerald-50 border-emerald-200",
      text: "text-emerald-900",
      badge: "bg-emerald-100 text-emerald-800",
    },
    attention: {
      label: "Atención",
      icon: <AlertTriangle className="h-4 w-4" />,
      bg: "bg-amber-50 border-amber-200",
      text: "text-amber-900",
      badge: "bg-amber-100 text-amber-900",
    },
    critical: {
      label: "Crítico",
      icon: <TrendingDown className="h-4 w-4" />,
      bg: "bg-red-50 border-red-200",
      text: "text-red-900",
      badge: "bg-red-100 text-red-900",
    },
  }[state];

  const kpiRows = [
    { label: METRIC_LABEL.facturado_periodo, uyuVal: uyu?.facturado, usdVal: usd?.facturado },
    { label: METRIC_LABEL.cobrado_periodo,   uyuVal: uyu?.cobrado,   usdVal: usd?.cobrado },
    { label: METRIC_LABEL.pendiente_periodo, uyuVal: uyu?.pendientePeriodo, usdVal: usd?.pendientePeriodo },
    { label: METRIC_LABEL.deuda_activa,      uyuVal: uyu?.deudaActiva, usdVal: usd?.deudaActiva },
    { label: METRIC_LABEL.deuda_vencida, uyuVal: uyu?.deudaVencida, usdVal: usd?.deudaVencida, warn: true },
    { label: METRIC_LABEL.caja_disponible, uyuVal: uyu?.cajaDisponible, usdVal: usd?.cajaDisponible },
  ];

  const totalVencida = (uyu?.deudaVencida ?? 0) + (usd?.deudaVencida ?? 0);
  const mainRisk =
    state === "critical"
      ? clientStates.riesgoAlto > 0
        ? `${clientStates.riesgoAlto} cliente${clientStates.riesgoAlto > 1 ? "s" : ""} de riesgo alto`
        : "Caja insuficiente para cubrir pagos próximos"
      : state === "attention"
      ? totalVencida > 0
        ? "Deuda vencida activa en cartera"
        : `${clientStates.conDeudaVencida} cliente${clientStates.conDeudaVencida > 1 ? "s" : ""} con deuda vencida`
      : null;

  const bestSignal =
    (uyu?.efectividad ?? 0) >= 0.8 || (usd?.efectividad ?? 0) >= 0.8
      ? "Efectividad de cobros >80%"
      : clientStates.sinDeuda > clientStates.conDeudaVencida
      ? "Mayoría de clientes sin deuda activa"
      : null;

  const suggestedAction =
    state === "critical"
      ? "Revisar clientes críticos y caja en Tesorería"
      : state === "attention"
      ? "Gestionar deuda vencida en Cartera"
      : "Mantener seguimiento de cobranza";

  return (
    <div className={`rounded-2xl border p-4 ${stateConfig.bg}`}>
      {/* Header: estado + período */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 ${stateConfig.text}`}>
          {stateConfig.icon}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${stateConfig.badge}`}>
            Estado financiero: {stateConfig.label}
          </span>
        </div>
        <p className={`text-[11px] font-medium opacity-75 ${stateConfig.text}`}>
          Resumen ejecutivo — {periodLabel}
        </p>
      </div>

      {/* Compact KPI table */}
      <div className={`mt-3 divide-y divide-current/10 ${stateConfig.text}`}>
        {kpiRows.map((row) => {
          const showUyu = (row.uyuVal ?? 0) > 0;
          const showUsd = (row.usdVal ?? 0) > 0;
          if (!showUyu && !showUsd) return null;
          const warnCls = row.warn ? "font-bold" : "font-semibold";
          return (
            <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="shrink-0 text-[11px] opacity-70">{row.label}</span>
              <div className="flex flex-wrap justify-end gap-x-4 gap-y-0.5 text-xs tabular-nums">
                {showUyu && (
                  <span className={warnCls}>
                    {fmtAmount(row.uyuVal!, "UYU")}{" "}
                    <span className="text-[10px] font-normal opacity-50">UYU</span>
                  </span>
                )}
                {showUsd && (
                  <span className={warnCls}>
                    {fmtAmount(row.usdVal!, "USD")}{" "}
                    <span className="text-[10px] font-normal opacity-50">USD</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chips — max 3 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {mainRisk && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateConfig.badge}`}>
            <AlertTriangle className="h-3 w-3" />
            {mainRisk}
          </span>
        )}
        {bestSignal && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            <TrendingUp className="h-3 w-3" />
            {bestSignal}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
          <ArrowRight className="h-3 w-3" />
          {suggestedAction}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active debt clients table
// ---------------------------------------------------------------------------

function ActiveDebtClientsTable({
  rows,
  selectedCurrency,
}: {
  rows: DashboardActiveDebtRow[];
  selectedCurrency: "all" | "UYU" | "USD";
}) {
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        selectedCurrency === "all" ? true : r.currency === selectedCurrency
      ),
    [rows, selectedCurrency]
  );

  const visible = showAll ? filtered : filtered.slice(0, TABLE_INITIAL_ROWS);
  const canToggle = filtered.length > TABLE_INITIAL_ROWS;

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--copilot-border)] p-6 text-center">
        <CheckCircle className="mx-auto h-5 w-5 text-emerald-600 mb-2" />
        <p className={`text-sm ${C.muted}`}>No hay clientes con deuda activa.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]">
              {[
                "Cliente",
                "Moneda",
                "Deuda activa",
                "Deuda vencida",
                "Días atraso",
                "Estado",
                "Acciones",
              ].map((h) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-left font-semibold tracking-wide ${C.muted}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={r.rowId}
                className={`border-b border-[var(--copilot-border)] ${i % 2 === 0 ? "bg-[var(--copilot-card-bg)]" : "bg-[var(--copilot-table-row-alt-bg)]"} hover:bg-[var(--copilot-table-row-hover-bg)]`}
              >
                <td className={`px-3 py-2 font-medium ${C.ink}`}>{r.name}</td>
                <td className={`px-3 py-2 font-semibold uppercase ${C.muted}`}>{r.currency}</td>
                <td className="px-3 py-2 tabular-nums font-medium text-amber-700">
                  {fmtAmount(r.activeDebt, r.currency)}
                </td>
                <td className={`px-3 py-2 tabular-nums ${r.overdueDebt > 0 ? "font-semibold text-rose-700" : C.muted}`}>
                  {r.overdueDebt > 0 ? fmtAmount(r.overdueDebt, r.currency) : "—"}
                </td>
                <td className={`px-3 py-2 tabular-nums ${C.muted}`}>
                  {r.overdueDebt > 0 && (r.overdueDays ?? 0) > 0 ? `${r.overdueDays}d` : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.status === "Riesgo alto"
                        ? "bg-rose-100 text-rose-800"
                        : r.status === "Vencido"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Link
                      href={`/copilot/clientes/${r.companyId}`}
                      className={`hover:underline ${C.accent}`}
                    >
                      Ver ficha
                    </Link>
                    <Link
                      href={`/copilot/clientes/${r.companyId}?tab=estado-cuenta`}
                      className={`hover:underline ${C.muted}`}
                    >
                      Estado
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canToggle && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className={`rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] px-3 py-1.5 text-xs font-semibold ${C.accent} hover:bg-[var(--copilot-hover-bg)]`}
          >
            {showAll ? "Mostrar menos" : "Ver todos"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent movements table
// ---------------------------------------------------------------------------

function movementTypeLabel(type: DashboardRecentMovement["type"]): string {
  if (type === "factura") return "Factura";
  if (type === "recibo") return "Recibo";
  return "Nota crédito";
}

function movementTypeBadgeClass(type: DashboardRecentMovement["type"]): string {
  if (type === "factura") return "bg-blue-50 text-blue-700";
  if (type === "recibo") return "bg-emerald-50 text-emerald-700";
  return "bg-violet-50 text-violet-700";
}

function RecentMovementsTable({
  movements,
  selectedCurrency,
  exchangeRate,
}: {
  movements: DashboardRecentMovement[];
  selectedCurrency: "all" | "UYU" | "USD";
  exchangeRate?: number | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const showEquiv = !!exchangeRate;

  const filtered = useMemo(
    () =>
      movements.filter((m) =>
        selectedCurrency === "all" ? true : m.currency === selectedCurrency
      ),
    [movements, selectedCurrency]
  );

  const visible = showAll ? filtered : filtered.slice(0, TABLE_INITIAL_ROWS);
  const canToggle = filtered.length > TABLE_INITIAL_ROWS;

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--copilot-border)] p-6 text-center">
        <p className={`text-sm ${C.muted}`}>No hay movimientos en este período.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
        <table className={`w-full text-xs ${showEquiv ? "min-w-[1020px]" : "min-w-[880px]"}`}>
          <thead>
            <tr className="border-b border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]">
              {[
                "Fecha",
                "Tipo",
                "Cliente",
                "Comprobante",
                "Moneda orig.",
                "Debe",
                "Haber",
                ...(showEquiv ? ["Equiv. USD"] : []),
                "Saldo pendiente",
              ].map((h) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-left font-semibold tracking-wide ${C.muted}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((m, i) => {
              const debe =
                m.type === "factura" ? fmtAmount(m.amount, m.currency) : "—";
              const haber =
                m.type === "recibo" || m.type === "nota_credito"
                  ? fmtAmount(m.amount, m.currency)
                  : "—";
              const saldo =
                m.type === "factura" && m.balance > 0
                  ? fmtAmount(m.balance, m.currency)
                  : "—";
              const equivUsd = showEquiv && exchangeRate
                ? fmtAmount(
                    m.currency === "USD" ? m.amount : roundUsd(m.amount / exchangeRate),
                    "USD"
                  )
                : null;
              return (
                <tr
                  key={`${m.companyId}-${m.date}-${m.reference}-${i}`}
                  className={`border-b border-[var(--copilot-border)] ${i % 2 === 0 ? "bg-[var(--copilot-card-bg)]" : "bg-[var(--copilot-table-row-alt-bg)]"} hover:bg-[var(--copilot-table-row-hover-bg)]`}
                >
                  <td className={`px-3 py-2 tabular-nums ${C.muted}`}>{fmtDate(m.date)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${movementTypeBadgeClass(m.type)}`}
                    >
                      {movementTypeLabel(m.type)}
                    </span>
                  </td>
                  <td className={`px-3 py-2 ${C.ink}`}>
                    <Link
                      href={`/copilot/clientes/${m.companyId}`}
                      className="hover:underline"
                    >
                      {m.clientName}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 ${C.muted}`}>{m.reference}</td>
                  <td className={`px-3 py-2 uppercase ${C.muted}`}>{m.currency}</td>
                  <td className={`px-3 py-2 tabular-nums ${debe === "—" ? C.muted : C.ink}`}>{debe}</td>
                  <td className={`px-3 py-2 tabular-nums ${haber === "—" ? C.muted : "text-emerald-700"}`}>
                    {haber}
                  </td>
                  {showEquiv && (
                    <td className={`px-3 py-2 tabular-nums text-[10px] ${C.muted}`}>
                      {equivUsd ?? "—"}
                    </td>
                  )}
                  <td
                    className={`px-3 py-2 tabular-nums ${saldo === "—" ? C.muted : "font-medium text-amber-700"}`}
                  >
                    {saldo}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canToggle && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className={`rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] px-3 py-1.5 text-xs font-semibold ${C.accent} hover:bg-[var(--copilot-hover-bg)]`}
          >
            {showAll ? "Mostrar menos" : "Ver todos"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultPeriod = useMemo(() => defaultHoyPeriodRange(today), [today]);

  const [draftFrom, setDraftFrom] = useState(defaultPeriod.from);
  const [draftTo, setDraftTo] = useState(defaultPeriod.to);
  const [confirmedFrom, setConfirmedFrom] = useState(defaultPeriod.from);
  const [confirmedTo, setConfirmedTo] = useState(defaultPeriod.to);
  const [selectedCurrency, setSelectedCurrency] = useState<"all" | "UYU" | "USD" | "USD_consolidated">("all");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [editingTc, setEditingTc] = useState(false);
  const [tcInputDraft, setTcInputDraft] = useState("");
  const [tcSaving, setTcSaving] = useState(false);

  useEffect(() => {
    if (selectedCurrency !== "USD_consolidated") {
      setEditingTc(false);
    }
  }, [selectedCurrency]);

  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Data state
  const [currencyData, setCurrencyData] = useState<DashboardCurrencyData[]>([]);
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioLoad["rows"]>([]);
  const [clientStates, setClientStates] = useState<DashboardClientStates>({
    sinDeuda: 0, conDeudaAlDia: 0, conDeudaVencida: 0, riesgoAlto: 0, total: 0,
  });
  const [monthlyData, setMonthlyData] = useState<DashboardMonthlyPoint[]>([]);
  const [recentMovements, setRecentMovements] = useState<DashboardRecentMovement[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const handleSaveTc = useCallback(async () => {
    const val = parseFloat(tcInputDraft);
    if (isNaN(val) || val <= 0 || val >= 1000) return;
    setTcSaving(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uyu_per_usd: val }),
      });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        setExchangeRate((j?.ok && j.data?.rate?.uyuPerUsd) ? (j.data.rate.uyuPerUsd as number) : val);
        setEditingTc(false);
      }
    } finally {
      setTcSaving(false);
    }
  }, [tcInputDraft]);

  const periodLabel = `${confirmedFrom} — ${confirmedTo}`;

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const sig = ctrl.signal;

    async function doLoad() {
      setLoading(true);

      const periodQ = new URLSearchParams({
        mode: "period_only",
        period_start: confirmedFrom,
        period_end: confirmedTo,
      });

      const monthRanges = getMonthRangesForPeriod(confirmedFrom, confirmedTo, 12);
      const monthQueries = monthRanges.map((m) =>
        new URLSearchParams({
          mode: "period_only",
          period_start: m.from,
          period_end: m.to,
        })
      );

      const [
        hubRes,
        reconAllRes,
        reconPeriodRes,
        cashRes,
        outflowRes,
        tcRes,
        ...monthlyRes
      ] = await Promise.allSettled([
        copilotApiFetch("/api/copilot/rutas-hub", { signal: sig }),
        copilotApiFetch("/api/copilot/financial-reconciliation?mode=all_outstanding", { signal: sig }),
        copilotApiFetch(`/api/copilot/financial-reconciliation?${periodQ}`, { signal: sig }),
        copilotApiFetch("/api/copilot/treasury/cash-position", { signal: sig }),
        copilotApiFetch("/api/copilot/treasury/scheduled-payments?include_summary=1&horizon_days=30", { signal: sig }),
        copilotApiFetch("/api/copilot/treasury/exchange-rates", { signal: sig }),
        ...monthQueries.map((q) =>
          copilotApiFetch(`/api/copilot/financial-reconciliation?${q}`, { signal: sig })
        ),
      ]);

      if (sig.aborted) return;

      // ── Portfolio (hub) ──
      let portfolioRows: ClientPortfolioLoad["rows"] = [];
      let portfolioDetails: ClientPortfolioLoad["details"] = {};
      if (hubRes.status === "fulfilled") {
        const j = (await hubRes.value.json().catch(() => null)) as Record<string, unknown> | null;
        const portfolio = j?.portfolio as ClientPortfolioLoad | null;
        portfolioRows = portfolio?.rows ?? [];
        portfolioDetails = portfolio?.details ?? {};
      }

      // ── Reconciliation ──
      let outstandingReport: FinancialConsistencyReport | null = null;
      let periodReport: FinancialConsistencyReport | null = null;

      if (reconAllRes.status === "fulfilled") {
        const j = (await reconAllRes.value.json().catch(() => null)) as { report?: FinancialConsistencyReport } | null;
        outstandingReport = j?.report ?? null;
      }
      if (reconPeriodRes.status === "fulfilled") {
        const j = (await reconPeriodRes.value.json().catch(() => null)) as { report?: FinancialConsistencyReport } | null;
        periodReport = j?.report ?? null;
      }

      // ── Treasury (mismo contrato JSON que /copilot/hoy) ──
      let cashPositions: CashPositionByCurrency[] = [];
      let outflowSummaries: TreasuryOutflowSummary[] = [];

      if (cashRes.status === "fulfilled") {
        const j = await cashRes.value.json().catch(() => null);
        if (cashRes.value.ok) {
          cashPositions = parseTreasuryCashPositionJson(j);
        }
      }
      if (outflowRes.status === "fulfilled") {
        const j = await outflowRes.value.json().catch(() => null);
        if (outflowRes.value.ok) {
          outflowSummaries = parseTreasuryScheduledSummaryJson(j);
        }
      }

      // ── Exchange rate ──
      if (tcRes.status === "fulfilled") {
        const j = await tcRes.value.json().catch(() => null);
        if (tcRes.value.ok && j?.ok && j.data?.rate?.uyuPerUsd) {
          setExchangeRate(j.data.rate.uyuPerUsd as number);
        }
      }

      // ── Monthly trend (one bucket per calendar month in selected period) ──
      const parsedMonthly: DashboardMonthlyPoint[] = [];
      for (let i = 0; i < monthlyRes.length; i++) {
        const res = monthlyRes[i];
        const meta = monthRanges[i];
        if (!meta) continue;
        let report: FinancialConsistencyReport | null = null;
        if (res?.status === "fulfilled") {
          const j = (await (res as PromiseFulfilledResult<Response>).value.json().catch(() => null)) as { report?: FinancialConsistencyReport } | null;
          report = j?.report ?? null;
        }
        parsedMonthly.push(extractMonthlyPoint(report, meta.yearMonth));
      }

      // ── Derived data ──
      const newCurrData = extractDashboardCurrencyData({
        periodReport,
        outstandingReport,
        cashPositions,
        outflowSummaries,
        portfolioRows,
      });

      if (sig.aborted) return;
      setCurrencyData(newCurrData);
      setPortfolioRows(portfolioRows);
      setClientStates(extractClientStates(portfolioRows));
      setMonthlyData(parsedMonthly);
      setRecentMovements(
        extractRecentMovements(portfolioDetails, confirmedFrom, confirmedTo)
      );
      setLastUpdated(new Date());
      setLoading(false);
    }

    doLoad().catch(console.error);
    return () => ctrl.abort();
  }, [confirmedFrom, confirmedTo, today, reloadTick]);

  const uyu = currencyData.find((d) => d.currency === "UYU");
  const usd = currencyData.find((d) => d.currency === "USD");
  const dashState = determineDashboardState(currencyData, clientStates);

  // USD consolidado helpers
  const isConsolidated = selectedCurrency === "USD_consolidated" && exchangeRate !== null;
  const showTcControls = selectedCurrency === "USD_consolidated";
  const effectiveCurrency: "all" | "UYU" | "USD" = isConsolidated
    ? "USD"
    : selectedCurrency === "USD_consolidated"
    ? "all"
    : (selectedCurrency as "all" | "UYU" | "USD");
  const effectiveCurrencyForTables: "all" | "UYU" | "USD" = isConsolidated ? "all" : effectiveCurrency;
  const currencyModeLabel = isConsolidated
    ? "USD consolidado"
    : effectiveCurrency === "all"
      ? "UYU + USD (separado)"
      : effectiveCurrency;
  const consUyu = (val: number) => (isConsolidated ? 0 : val);
  const consUsd = (uyuVal: number, usdVal: number) =>
    isConsolidated ? roundUsd(consolidateToUsd(uyuVal, usdVal, exchangeRate!)) : usdVal;
  const consBarData = (bars: BarData[]): BarData[] =>
    isConsolidated
      ? bars.map((b) => ({
          label: b.label,
          uyu: 0,
          usd: roundUsd(consolidateToUsd(b.uyu ?? 0, b.usd ?? 0, exchangeRate!)),
        }))
      : bars;
  const pdfCurrency = selectedCurrency;

  const consolidatedCurrencyData = useMemo((): DashboardCurrencyData => {
    const tc = exchangeRate ?? 1;
    const c = (uyuVal: number, usdVal: number) => roundUsd(consolidateToUsd(uyuVal, usdVal, tc));
    const cf = c(uyu?.facturado ?? 0, usd?.facturado ?? 0);
    const cc = c(uyu?.cobrado ?? 0, usd?.cobrado ?? 0);
    return {
      currency: "USD",
      facturado: cf,
      cobrado: cc,
      pendientePeriodo: roundUsd(cf - cc),
      efectividad: cf > 0 ? Math.min(cc / cf, 2) : null,
      deudaActiva: c(uyu?.deudaActiva ?? 0, usd?.deudaActiva ?? 0),
      deudaVencida: c(uyu?.deudaVencida ?? 0, usd?.deudaVencida ?? 0),
      aging: [],
      cajaDisponible: c(uyu?.cajaDisponible ?? 0, usd?.cajaDisponible ?? 0),
      cajaDespPagos: c(uyu?.cajaDespPagos ?? 0, usd?.cajaDespPagos ?? 0),
    };
  }, [uyu, usd, exchangeRate]);

  const effectiveCurrencyData = useMemo((): DashboardCurrencyData[] => {
    if (isConsolidated) return [consolidatedCurrencyData];
    if (effectiveCurrency === "all") return currencyData;
    return currencyData.filter((d) => d.currency === effectiveCurrency);
  }, [isConsolidated, consolidatedCurrencyData, effectiveCurrency, currencyData]);

  // Prepare monthly chart data
  const monthlyIssued: BarData[] = consBarData(monthlyData.map((p) => ({
    label: p.monthLabel,
    uyu: p.issuedUYU,
    usd: p.issuedUSD,
  })));
  const monthlyCollected: BarData[] = consBarData(monthlyData.map((p) => ({
    label: p.monthLabel,
    uyu: p.collectedUYU,
    usd: p.collectedUSD,
  })));

  // Ventas vs Cobros (current period)
  const vsGroups = isConsolidated
    ? [{ label: "USD (cons.)", a: roundUsd(consolidateToUsd(uyu?.facturado ?? 0, usd?.facturado ?? 0, exchangeRate!)), b: roundUsd(consolidateToUsd(uyu?.cobrado ?? 0, usd?.cobrado ?? 0, exchangeRate!)), aLabel: "Facturado", bLabel: "Cobrado" }]
    : [
        ...(effectiveCurrency !== "USD" && (uyu?.facturado ?? 0) + (uyu?.cobrado ?? 0) > 0
          ? [{ label: "UYU", a: uyu?.facturado ?? 0, b: uyu?.cobrado ?? 0, aLabel: "Facturado", bLabel: "Cobrado" }]
          : []),
        ...(effectiveCurrency !== "UYU" && (usd?.facturado ?? 0) + (usd?.cobrado ?? 0) > 0
          ? [{ label: "USD", a: usd?.facturado ?? 0, b: usd?.cobrado ?? 0, aLabel: "Facturado", bLabel: "Cobrado" }]
          : []),
      ];

  // Aging (all outstanding) — display labels use readable names
  const agingUYU = uyu?.aging ?? [];
  const agingUSD = usd?.aging ?? [];
  const AGING_KEYS = ["0-30", "31-60", "61-90", "90+"] as const;
  const AGING_DISPLAY: Record<string, string> = {
    "0-30": "0–30d", "31-60": "31–60d", "61-90": "61–90d", "90+": "+90d",
  };
  const agingBars: BarData[] = consBarData(AGING_KEYS.map((key) => ({
    label: AGING_DISPLAY[key]!,
    uyu: agingUYU.find((b) => b.label === key)?.amount ?? 0,
    usd: agingUSD.find((b) => b.label === key)?.amount ?? 0,
  })));

  // noPagos — detect when caja después de pagos = caja disponible (no scheduled payments)
  const noPagosUYU = Math.abs((uyu?.cajaDespPagos ?? 0) - (uyu?.cajaDisponible ?? 0)) < 0.01;
  const noPagosUSD = Math.abs((usd?.cajaDespPagos ?? 0) - (usd?.cajaDisponible ?? 0)) < 0.01;
  const noPagos = isConsolidated
    ? Math.abs(consolidatedCurrencyData.cajaDespPagos - consolidatedCurrencyData.cajaDisponible) < 0.01
    : effectiveCurrency === "USD"
    ? noPagosUSD
    : effectiveCurrency === "UYU"
    ? noPagosUYU
    : noPagosUYU && noPagosUSD;

  // Top debtors / billing (por moneda, sin mezclar)
  const debtorItemsUYU = useMemo(
    () =>
      extractTopDebtorsForCurrency(portfolioRows, "UYU").map((d) => ({
        label: d.name,
        value: d.value,
        id: d.companyId,
      })),
    [portfolioRows]
  );
  const debtorItemsUSD = useMemo(
    () =>
      extractTopDebtorsForCurrency(portfolioRows, "USD").map((d) => ({
        label: d.name,
        value: d.value,
        id: d.companyId,
      })),
    [portfolioRows]
  );
  const billingItemsUYU = useMemo(
    () =>
      extractTopBillingForCurrency(portfolioRows, "UYU").map((d) => ({
        label: d.name,
        value: d.value,
        id: d.companyId,
      })),
    [portfolioRows]
  );
  const billingItemsUSD = useMemo(
    () =>
      extractTopBillingForCurrency(portfolioRows, "USD").map((d) => ({
        label: d.name,
        value: d.value,
        id: d.companyId,
      })),
    [portfolioRows]
  );
  const activeDebtRows = useMemo(
    () => extractActiveDebtClientRows(portfolioRows),
    [portfolioRows]
  );

  const consolidatedActiveDebtRows = useMemo((): DashboardActiveDebtRow[] => {
    if (!isConsolidated) return [];
    const tc = exchangeRate!;
    const byCompany = new Map<string, { name: string; active: number; overdue: number; overdueDays: number | null; status: string; risk: string }>();
    for (const row of activeDebtRows) {
      const toUsd = (v: number) => roundUsd(row.currency === "UYU" ? v / tc : v);
      const prev = byCompany.get(row.companyId);
      if (!prev) {
        byCompany.set(row.companyId, {
          name: row.name,
          active: toUsd(row.activeDebt),
          overdue: toUsd(row.overdueDebt),
          overdueDays: row.overdueDays,
          status: row.status,
          risk: row.risk,
        });
      } else {
        byCompany.set(row.companyId, {
          name: row.name,
          active: prev.active + toUsd(row.activeDebt),
          overdue: prev.overdue + toUsd(row.overdueDebt),
          overdueDays: row.overdueDays != null && (prev.overdueDays == null || row.overdueDays > prev.overdueDays)
            ? row.overdueDays
            : prev.overdueDays,
          status: prev.status,
          risk: prev.risk === "alto" || row.risk === "alto" ? "alto" : prev.risk === "medio" || row.risk === "medio" ? "medio" : prev.risk,
        });
      }
    }
    return Array.from(byCompany.entries())
      .map(([companyId, d]): DashboardActiveDebtRow => ({
        rowId: `cons-${companyId}`,
        companyId,
        name: d.name,
        currency: "USD",
        activeDebt: d.active,
        overdueDebt: d.overdue,
        overdueDays: d.overdueDays,
        status: d.status,
        risk: d.risk,
      }))
      .sort((a, b) => b.activeDebt - a.activeDebt);
  }, [isConsolidated, activeDebtRows, exchangeRate]);

  const consolidatedDebtorItems = useMemo(
    () =>
      isConsolidated
        ? portfolioRows
            .filter((r) => r.debt_uyu > 0 || r.debt_usd > 0)
            .map((r) => ({
              label: r.name,
              value: roundUsd(consolidateToUsd(r.debt_uyu, r.debt_usd, exchangeRate!)),
              id: r.company_id,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10)
        : [],
    [isConsolidated, portfolioRows, exchangeRate]
  );
  const consolidatedBillingItems = useMemo(
    () =>
      isConsolidated
        ? portfolioRows
            .filter((r) => (r.billing_uyu ?? 0) > 0 || (r.billing_usd ?? 0) > 0)
            .map((r) => ({
              label: r.name,
              value: roundUsd(consolidateToUsd(r.billing_uyu ?? 0, r.billing_usd ?? 0, exchangeRate!)),
              id: r.company_id,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10)
        : [],
    [isConsolidated, portfolioRows, exchangeRate]
  );
  const debtorItems = isConsolidated ? consolidatedDebtorItems : effectiveCurrency === "USD" ? debtorItemsUSD : debtorItemsUYU;
  const billingItems = isConsolidated ? consolidatedBillingItems : effectiveCurrency === "USD" ? billingItemsUSD : billingItemsUYU;

  // Top-10 as % of total debt per currency
  const uyuTop10Sum = debtorItemsUYU.reduce((s, d) => s + d.value, 0);
  const usdTop10Sum = debtorItemsUSD.reduce((s, d) => s + d.value, 0);
  const uyuTop10Pct = (uyu?.deudaActiva ?? 0) > 0
    ? Math.round((uyuTop10Sum / uyu!.deudaActiva) * 100)
    : null;
  const usdTop10Pct = (usd?.deudaActiva ?? 0) > 0
    ? Math.round((usdTop10Sum / usd!.deudaActiva) * 100)
    : null;

  // Cash projection (area chart) — mode-aware
  const cashProjectionPoints = useMemo(() => {
    if (isConsolidated) {
      const disp = consolidatedCurrencyData.cajaDisponible;
      const desp = consolidatedCurrencyData.cajaDespPagos;
      if (disp === 0 && desp === 0) return [];
      return [{ label: "Hoy", value: disp }, { label: "−pagos", value: desp }];
    }
    if (effectiveCurrency === "USD") {
      if (usd?.cajaDisponible === undefined) return [];
      return [{ label: "Hoy", value: usd.cajaDisponible }, { label: "−pagos", value: usd.cajaDespPagos }];
    }
    if (uyu?.cajaDisponible === undefined) return [];
    return [{ label: "Hoy", value: uyu.cajaDisponible }, { label: "−pagos", value: uyu.cajaDespPagos }];
  }, [isConsolidated, effectiveCurrency, consolidatedCurrencyData, uyu, usd]);

  const hasPendingChanges =
    draftFrom !== confirmedFrom || draftTo !== confirmedTo;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              <h1 className={`text-sm font-bold ${C.ink}`}>Dashboard Resumen</h1>
            </div>
            <p className={`mt-0.5 text-[11px] ${C.muted}`}>
              Análisis ejecutivo de ventas, cobros, deuda, clientes y caja.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastUpdated && !loading && (
              <p className={`text-[10px] ${C.muted}`}>
                Actualizado {lastUpdated.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <a
              href={`/api/copilot/dashboard/summary.pdf?from=${confirmedFrom}&to=${confirmedTo}&currency=${pdfCurrency}`}
              target="_blank"
              rel="noopener noreferrer"
              className={C.btnGhost}
              title="Descargar PDF del período actual"
            >
              <FileDown className="h-3 w-3" />
              Descargar PDF
            </a>
            <button
              type="button"
              onClick={() => setReloadTick((t) => t + 1)}
              className={C.btnGhost}
              disabled={loading}
              title="Recargar datos"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Cargando…" : "Actualizar"}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label className={`text-[11px] font-medium ${C.muted}`}>
            Desde
            <input
              type="date"
              value={draftFrom}
              max={draftTo}
              onChange={(e) => setDraftFrom(e.target.value)}
              className={`${C.input} ml-1.5`}
            />
          </label>
          <label className={`text-[11px] font-medium ${C.muted}`}>
            Hasta
            <input
              type="date"
              value={draftTo}
              min={draftFrom}
              max={today}
              onChange={(e) => setDraftTo(e.target.value)}
              className={`${C.input} ml-1.5`}
            />
          </label>
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value as "all" | "UYU" | "USD" | "USD_consolidated")}
            className={C.input}
            aria-label="Filtrar por moneda"
          >
            <option value="all">UYU + USD (separado)</option>
            <option value="UYU">Solo UYU</option>
            <option value="USD">Solo USD</option>
            <option value="USD_consolidated">
              {exchangeRate === null ? "USD consolidado (configurar TC)" : "USD consolidado"}
            </option>
          </select>
          {showTcControls && (
            editingTc ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-medium ${C.muted}`}>TC UYU/USD</span>
                <input
                  type="number"
                  min="0.01"
                  max="999.99"
                  step="0.01"
                  placeholder="Ej: 43.50"
                  value={tcInputDraft}
                  onChange={(e) => setTcInputDraft(e.target.value)}
                  className={`${C.input} w-28`}
                  aria-label="Tipo de cambio pesos por dólar"
                />
                <button type="button" onClick={handleSaveTc} disabled={tcSaving} className={C.btn}>
                  {tcSaving ? "Guardando…" : "Guardar TC"}
                </button>
                <button type="button" onClick={() => setEditingTc(false)} className={C.btnGhost}>
                  Cancelar
                </button>
              </div>
            ) : exchangeRate !== null ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
                  {formatExchangeRateLabel(exchangeRate)}
                </span>
                <button
                  type="button"
                  onClick={() => { setTcInputDraft(String(exchangeRate)); setEditingTc(true); }}
                  className={C.btnGhost}
                >
                  Editar TC
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="number"
                  min="0.01"
                  max="999.99"
                  step="0.01"
                  placeholder="TC UYU/USD  (ej: 43.50)"
                  value={tcInputDraft}
                  onChange={(e) => setTcInputDraft(e.target.value)}
                  className={`${C.input} w-36`}
                  aria-label="Tipo de cambio pesos por dólar"
                />
                <button type="button" onClick={handleSaveTc} disabled={tcSaving} className={C.btn}>
                  {tcSaving ? "Guardando…" : "Guardar TC"}
                </button>
                <span className={`text-[10px] ${C.muted}`}>Necesario para usar USD consolidado.</span>
              </div>
            )
          )}
          {hasPendingChanges && (
            <button
              type="button"
              onClick={() => {
                setConfirmedFrom(draftFrom);
                setConfirmedTo(draftTo);
              }}
              className={C.btn}
            >
              Aplicar
            </button>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">

        {/* Executive summary */}
        {loading ? (
          <Skeleton className="h-36 w-full" />
        ) : (
          <ExecutiveSummaryCard
            state={dashState}
            currencyData={effectiveCurrencyData}
            clientStates={clientStates}
            periodLabel={periodLabel}
          />
        )}

        {/* KPI grid */}
        <section aria-label="Indicadores clave">
          <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wide ${C.muted}`}>
            Indicadores del período
          </h2>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              <KpiCard
                title={METRIC_LABEL.facturado_periodo}
                tooltip="Ventas/facturas emitidas dentro del rango seleccionado."
                uyuValue={consUyu(uyu?.facturado ?? 0)}
                usdValue={consUsd(uyu?.facturado ?? 0, usd?.facturado ?? 0)}
                selectedCurrency={effectiveCurrency}
                href="/copilot/cartera"
              />
              <KpiCard
                title={METRIC_LABEL.cobrado_periodo}
                tooltip="Recibos registrados en Zeta dentro del rango seleccionado."
                uyuValue={consUyu(uyu?.cobrado ?? 0)}
                usdValue={consUsd(uyu?.cobrado ?? 0, usd?.cobrado ?? 0)}
                selectedCurrency={effectiveCurrency}
                href="/copilot/cartera"
              />
              <KpiCard
                title={METRIC_LABEL.pendiente_periodo}
                tooltip="Facturado menos cobrado dentro del rango seleccionado."
                uyuValue={consUyu(uyu?.pendientePeriodo ?? 0)}
                usdValue={consUsd(uyu?.pendientePeriodo ?? 0, usd?.pendientePeriodo ?? 0)}
                selectedCurrency={effectiveCurrency}
                href="/copilot/cartera"
              />
              <KpiCard
                title={METRIC_LABEL.deuda_activa}
                tooltip="Suma de todas las facturas pendientes al día de hoy. No está limitada por el rango de fechas seleccionado."
                uyuValue={consUyu(uyu?.deudaActiva ?? 0)}
                usdValue={consUsd(uyu?.deudaActiva ?? 0, usd?.deudaActiva ?? 0)}
                selectedCurrency={effectiveCurrency}
                href="/copilot/cartera"
                secondary="No depende del período seleccionado."
              />
              <KpiCard
                title={METRIC_LABEL.deuda_vencida}
                tooltip="Parte de la cartera pendiente actual cuya fecha de vencimiento ya pasó. No depende del rango seleccionado."
                uyuValue={consUyu(uyu?.deudaVencida ?? 0)}
                usdValue={consUsd(uyu?.deudaVencida ?? 0, usd?.deudaVencida ?? 0)}
                selectedCurrency={effectiveCurrency}
                href="/copilot/cartera"
                negative
              />
              <KpiCard
                title={METRIC_LABEL.caja_disponible}
                tooltip="Dinero disponible actual en Tesorería."
                uyuValue={consUyu(uyu?.cajaDisponible ?? 0)}
                usdValue={consUsd(uyu?.cajaDisponible ?? 0, usd?.cajaDisponible ?? 0)}
                selectedCurrency={effectiveCurrency}
                href="/copilot/tesoreria"
              />
              <KpiCard
                title={METRIC_LABEL.caja_despues_pagos}
                tooltip={noPagos
                  ? "Sin pagos programados en los próximos 30 días. La proyección coincide con la caja disponible."
                  : "Saldo estimado luego de descontar pagos programados próximos."}
                uyuValue={consUyu(uyu?.cajaDespPagos ?? 0)}
                usdValue={consUsd(uyu?.cajaDespPagos ?? 0, usd?.cajaDespPagos ?? 0)}
                selectedCurrency={effectiveCurrency}
                href="/copilot/tesoreria"
                negative
                secondary={noPagos
                  ? "Proyección operativa. Sin pagos programados próximos."
                  : "Proyección operativa, no saldo bancario."}
              />
            </div>
          )}
        </section>

        {/* Charts row 1: monthly trends — split by currency when "all" */}
        <section aria-label="Tendencia mensual">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h2 className={`text-xs font-semibold uppercase tracking-wide ${C.muted}`}>
              Tendencia mensual del período
            </h2>
            <span className={`text-[10px] ${C.muted}`}>
              Rango: {fmtDate(confirmedFrom)} → {fmtDate(confirmedTo)}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-2">
            {effectiveCurrency === "all" ? (
              <>
                <ChartCard title="[1] Ventas por mes UYU" subtitle="Facturado UYU · escala independiente">
                  {loading ? <Skeleton className="h-28" /> : (
                    <VerticalBarChart data={monthlyIssued} selectedCurrency="UYU" height={140} emptyText="Sin facturación UYU" />
                  )}
                </ChartCard>
                <ChartCard title="[1] Ventas por mes USD" subtitle="Facturado USD · escala independiente">
                  {loading ? <Skeleton className="h-28" /> : (
                    <VerticalBarChart data={monthlyIssued} selectedCurrency="USD" height={140} emptyText="Sin facturación USD" />
                  )}
                </ChartCard>
                <ChartCard title="[2] Cobros por mes UYU" subtitle="Recibos UYU · escala independiente">
                  {loading ? <Skeleton className="h-28" /> : (
                    <VerticalBarChart data={monthlyCollected} selectedCurrency="UYU" height={140} emptyText="Sin cobros UYU" />
                  )}
                </ChartCard>
                <ChartCard title="[2] Cobros por mes USD" subtitle="Recibos USD · escala independiente">
                  {loading ? <Skeleton className="h-28" /> : (
                    <VerticalBarChart data={monthlyCollected} selectedCurrency="USD" height={140} emptyText="Sin cobros USD" />
                  )}
                </ChartCard>
                {/* [3] Ventas vs Cobros — per currency with % chips */}
                <ChartCard title="[3] Ventas vs Cobros UYU" subtitle="Período seleccionado · Verde = cobrado">
                  {loading ? <Skeleton className="h-28" /> : (uyu?.facturado ?? 0) + (uyu?.cobrado ?? 0) > 0 ? (
                    <GroupedBarChart groups={[{ label: "UYU", a: uyu?.facturado ?? 0, b: uyu?.cobrado ?? 0, aLabel: "Facturado", bLabel: "Cobrado" }]} height={140} />
                  ) : (
                    <p className={`py-6 text-center text-xs ${C.muted}`}>Sin datos UYU en el período</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-[var(--copilot-accent)]" /><p className={`text-[10px] ${C.muted}`}>Facturado</p></div>
                    <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-emerald-400" /><p className={`text-[10px] ${C.muted}`}>Cobrado</p></div>
                    {uyu?.efectividad != null && (
                      <span className={`ml-auto text-[10px] font-semibold ${uyu.efectividad >= 0.8 ? "text-emerald-700" : "text-amber-700"}`}>
                        Cobranza: {Math.round(uyu.efectividad * 100)}% · Pendiente: {Math.round(Math.max(0, 1 - uyu.efectividad) * 100)}%
                      </span>
                    )}
                  </div>
                </ChartCard>
                <ChartCard title="[3] Ventas vs Cobros USD" subtitle="Período seleccionado · Verde = cobrado">
                  {loading ? <Skeleton className="h-28" /> : (usd?.facturado ?? 0) + (usd?.cobrado ?? 0) > 0 ? (
                    <GroupedBarChart groups={[{ label: "USD", a: usd?.facturado ?? 0, b: usd?.cobrado ?? 0, aLabel: "Facturado", bLabel: "Cobrado" }]} height={140} />
                  ) : (
                    <p className={`py-6 text-center text-xs ${C.muted}`}>Sin datos USD en el período</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-[var(--copilot-accent)]" /><p className={`text-[10px] ${C.muted}`}>Facturado</p></div>
                    <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-emerald-400" /><p className={`text-[10px] ${C.muted}`}>Cobrado</p></div>
                    {usd?.efectividad != null && (
                      <span className={`ml-auto text-[10px] font-semibold ${usd.efectividad >= 0.8 ? "text-emerald-700" : "text-amber-700"}`}>
                        Cobranza: {Math.round(usd.efectividad * 100)}% · Pendiente: {Math.round(Math.max(0, 1 - usd.efectividad) * 100)}%
                      </span>
                    )}
                  </div>
                </ChartCard>
              </>
            ) : (
              <>
                <ChartCard
                  title="[1] Ventas por mes"
                  subtitle={`Facturado del período · ${currencyModeLabel}`}
                  badge={<ChartLegend selectedCurrency={effectiveCurrency} />}
                >
                  {loading ? (
                    <Skeleton className="h-28" />
                  ) : (
                    <VerticalBarChart
                      data={monthlyIssued}
                      selectedCurrency={effectiveCurrency}
                      height={140}
                      emptyText="Sin facturación en este rango"
                    />
                  )}
                </ChartCard>

                <ChartCard
                  title="[2] Cobros por mes"
                  subtitle={`Recibos registrados · ${currencyModeLabel}`}
                  badge={<ChartLegend selectedCurrency={effectiveCurrency} />}
                >
                  {loading ? (
                    <Skeleton className="h-28" />
                  ) : (
                    <VerticalBarChart
                      data={monthlyCollected}
                      selectedCurrency={effectiveCurrency}
                      height={140}
                      emptyText="Sin cobros registrados"
                    />
                  )}
                </ChartCard>

                <ChartCard
                  title="[3] Ventas vs Cobros"
                  subtitle={`Período seleccionado · ${currencyModeLabel} · Verde = cobrado`}
                >
                  {loading ? (
                    <Skeleton className="h-28" />
                  ) : vsGroups.length > 0 ? (
                    <GroupedBarChart groups={vsGroups} height={140} />
                  ) : (
                    <p className={`py-6 text-center text-xs ${C.muted}`}>
                      Sin datos en el período
                    </p>
                  )}
                  {(() => {
                    const eff = isConsolidated ? null : effectiveCurrency === "USD" ? usd?.efectividad : uyu?.efectividad;
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-[var(--copilot-accent)]" /><p className={`text-[10px] ${C.muted}`}>Facturado</p></div>
                        <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-emerald-400" /><p className={`text-[10px] ${C.muted}`}>Cobrado</p></div>
                        {eff != null && (
                          <span className={`ml-auto text-[10px] font-semibold ${eff >= 0.8 ? "text-emerald-700" : "text-amber-700"}`}>
                            Cobranza: {Math.round(eff * 100)}% · Pendiente: {Math.round(Math.max(0, 1 - eff) * 100)}%
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </ChartCard>
              </>
            )}
          </div>
        </section>

        {/* Charts row 2: aging + effectiveness */}
        <section aria-label="Antigüedad y efectividad">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-2">
            {effectiveCurrency === "all" ? (
              <>
                <ChartCard title="[4] Deuda por antigüedad UYU" subtitle="Basado en fecha de vencimiento · Estado actual">
                  {loading ? <Skeleton className="h-28" /> : (
                    <VerticalBarChart data={agingBars} selectedCurrency="UYU" height={140} emptyText="Sin deuda vencida UYU" />
                  )}
                </ChartCard>
                <ChartCard title="[4] Deuda por antigüedad USD" subtitle="Basado en fecha de vencimiento · Estado actual">
                  {loading ? <Skeleton className="h-28" /> : (
                    <VerticalBarChart data={agingBars} selectedCurrency="USD" height={140} emptyText="Sin deuda vencida USD" />
                  )}
                </ChartCard>
              </>
            ) : (
              <ChartCard
                title="[4] Deuda por antigüedad"
                subtitle={`Basado en fecha de vencimiento · Estado actual · ${currencyModeLabel}`}
                badge={<ChartLegend selectedCurrency={effectiveCurrency} />}
              >
                {loading ? (
                  <Skeleton className="h-28" />
                ) : (
                  <VerticalBarChart
                    data={agingBars}
                    selectedCurrency={effectiveCurrency}
                    height={140}
                    emptyText="Sin deuda vencida"
                  />
                )}
              </ChartCard>
            )}

            <ChartCard
              title="[10] Efectividad de cobros"
              subtitle="Cobrado del período / Facturado neto · Por moneda"
            >
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6" />
                  <Skeleton className="h-6" />
                </div>
              ) : effectiveCurrencyData.length === 0 ? (
                <p className={`py-4 text-center text-xs ${C.muted}`}>Sin datos</p>
              ) : (
                <div className="space-y-4">
                  {effectiveCurrencyData.map((d) => (
                    <GaugeRow
                      key={d.currency}
                      label={isConsolidated ? "Efectividad (USD cons.)" : "Efectividad"}
                      value={d.efectividad}
                      currency={d.currency}
                    />
                  ))}
                  <p className={`text-[10px] ${C.muted}`}>
                    Recibos cobrados / Facturado neto. Puede superar 100% si hay cobros
                    de facturas de períodos anteriores.
                  </p>
                </div>
              )}
            </ChartCard>
          </div>
        </section>

        {/* Charts row 3: top debtors + top billing */}
        <section aria-label="Top clientes">
          {effectiveCurrency === "all" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="[5] Top 10 deudores UYU"
                subtitle={uyuTop10Pct != null ? `Concentran el ${uyuTop10Pct}% de la deuda UYU total · Clic para ver ficha` : "Deuda activa UYU · Clic para ver ficha"}
              >
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-5" />
                    ))}
                  </div>
                ) : (
                  <HorizontalBarChart
                    items={debtorItemsUYU}
                    color="var(--copilot-accent)"
                    href={(id) => `/copilot/clientes/${id}`}
                    currency="UYU"
                  />
                )}
              </ChartCard>
              <ChartCard
                title="[5] Top 10 deudores USD"
                subtitle={usdTop10Pct != null ? `Concentran el ${usdTop10Pct}% de la deuda USD total · Clic para ver ficha` : "Deuda activa USD · Clic para ver ficha"}
              >
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-5" />
                    ))}
                  </div>
                ) : (
                  <HorizontalBarChart
                    items={debtorItemsUSD}
                    color="#3b82f6"
                    href={(id) => `/copilot/clientes/${id}`}
                    currency="USD"
                  />
                )}
              </ChartCard>
              <ChartCard
                title="[6] Top facturación histórica UYU"
                subtitle="Facturación total activa · Histórico total"
                badge={
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] text-amber-700">
                    Histórico total
                  </span>
                }
              >
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-5" />
                    ))}
                  </div>
                ) : (
                  <HorizontalBarChart
                    items={billingItemsUYU}
                    color="var(--copilot-accent)"
                    href={(id) => `/copilot/clientes/${id}`}
                    currency="UYU"
                  />
                )}
              </ChartCard>
              <ChartCard
                title="[6] Top facturación histórica USD"
                subtitle="Facturación total activa · Histórico total"
                badge={
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] text-amber-700">
                    Histórico total
                  </span>
                }
              >
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-5" />
                    ))}
                  </div>
                ) : (
                  <HorizontalBarChart
                    items={billingItemsUSD}
                    color="#3b82f6"
                    href={(id) => `/copilot/clientes/${id}`}
                    currency="USD"
                  />
                )}
              </ChartCard>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="[5] Top 10 clientes deudores"
                subtitle={
                  isConsolidated
                    ? "Deuda activa consolidada en USD · Clic para ver ficha"
                    : (effectiveCurrency === "USD" ? usdTop10Pct : uyuTop10Pct) != null
                    ? `Concentran el ${effectiveCurrency === "USD" ? usdTop10Pct : uyuTop10Pct}% de la deuda ${effectiveCurrency} total · Clic para ver ficha`
                    : `Deuda activa ${effectiveCurrency} · Clic para ver ficha`
                }
              >
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-5" />
                    ))}
                  </div>
                ) : (
                  <HorizontalBarChart
                    items={debtorItems}
                    color="var(--copilot-accent)"
                    href={(id) => `/copilot/clientes/${id}`}
                    currency={effectiveCurrency as "UYU" | "USD"}
                  />
                )}
              </ChartCard>

              <ChartCard
                title="[6] Top 10 por facturación histórica"
                subtitle="Facturación total activa · No filtrable por período desde esta vista"
                badge={
                  <span
                    title="Este gráfico usa facturación histórica total (all-time) porque no existe API por cliente para el período seleccionado."
                    className={`cursor-help rounded-full bg-amber-50 px-2 py-0.5 text-[9px] text-amber-700`}
                  >
                    Histórico total
                  </span>
                }
              >
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-5" />
                    ))}
                  </div>
                ) : (
                  <HorizontalBarChart
                    items={billingItems}
                    color="#3b82f6"
                    href={(id) => `/copilot/clientes/${id}`}
                    currency={effectiveCurrency as "UYU" | "USD"}
                  />
                )}
              </ChartCard>
            </div>
          )}
        </section>

        {/* Charts row 4: portfolio state card + cash projection */}
        <section aria-label="Estado de cartera y proyección">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-2">
            <ChartCard
              title="[7] Estado de cartera"
              subtitle="Los clientes se cuentan una sola vez aunque tengan deuda en más de una moneda."
            >
              {loading ? (
                <Skeleton className="h-40" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[var(--copilot-border)] p-3">
                      <p className={`text-[10px] leading-tight ${C.muted}`}>Clientes activos</p>
                      <p className={`mt-1 text-2xl font-bold tabular-nums ${C.ink}`}>{clientStates.total}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--copilot-border)] p-3">
                      <p className={`text-[10px] leading-tight ${C.muted}`}>Con deuda activa</p>
                      <p className={`mt-1 text-2xl font-bold tabular-nums ${C.ink}`}>{clientStates.total - clientStates.sinDeuda}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className={`text-[10px] leading-tight text-amber-700`}>Con deuda vencida</p>
                      <p className={`mt-1 text-2xl font-bold tabular-nums text-amber-800`}>
                        {clientStates.conDeudaVencida + clientStates.riesgoAlto}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className={`text-[10px] leading-tight text-emerald-700`}>Al día</p>
                      <p className={`mt-1 text-2xl font-bold tabular-nums text-emerald-800`}>{clientStates.conDeudaAlDia}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-[var(--copilot-border)] pt-2">
                    {isConsolidated ? (
                      <>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda activa (USD cons.)</p>
                          <p className={`text-sm font-semibold tabular-nums ${C.ink}`}>{fmtAmount(consolidatedCurrencyData.deudaActiva, "USD")}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda vencida (USD cons.)</p>
                          <p className={`text-sm font-semibold tabular-nums text-amber-700`}>{fmtAmount(consolidatedCurrencyData.deudaVencida, "USD")}</p>
                        </div>
                      </>
                    ) : effectiveCurrency === "USD" ? (
                      <>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda activa USD</p>
                          <p className={`text-sm font-semibold tabular-nums ${C.ink}`}>{fmtAmount(usd?.deudaActiva ?? 0, "USD")}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda vencida USD</p>
                          <p className={`text-sm font-semibold tabular-nums text-amber-700`}>{fmtAmount(usd?.deudaVencida ?? 0, "USD")}</p>
                        </div>
                      </>
                    ) : effectiveCurrency === "UYU" ? (
                      <>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda activa UYU</p>
                          <p className={`text-sm font-semibold tabular-nums ${C.ink}`}>{fmtAmount(uyu?.deudaActiva ?? 0, "UYU")}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda vencida UYU</p>
                          <p className={`text-sm font-semibold tabular-nums text-amber-700`}>{fmtAmount(uyu?.deudaVencida ?? 0, "UYU")}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda activa UYU</p>
                          <p className={`text-sm font-semibold tabular-nums ${C.ink}`}>{fmtAmount(uyu?.deudaActiva ?? 0, "UYU")}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] ${C.muted}`}>Deuda activa USD</p>
                          <p className={`text-sm font-semibold tabular-nums ${C.ink}`}>{fmtAmount(usd?.deudaActiva ?? 0, "USD")}</p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <Link href="/copilot/clientes" className={`text-[10px] ${C.accent} hover:underline flex items-center gap-1`}>
                      <Users className="h-3 w-3" />
                      Ver clientes
                    </Link>
                    <Link href="/copilot/cartera?filter=overdue" className={`text-[10px] ${C.muted} hover:underline`}>
                      Ver vencidos →
                    </Link>
                  </div>
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="[9] Caja proyectada 30 días"
              subtitle={`${currencyModeLabel} · Caja disponible hoy y proyección a 30 días`}
            >
              {loading ? (
                <Skeleton className="h-20" />
              ) : cashProjectionPoints.length >= 2 ? (
                <>
                  <AreaSparkline points={cashProjectionPoints} height={70} />
                  <div className="mt-2 flex justify-between">
                    <div>
                      <p className={`text-[10px] ${C.muted}`}>Disponible hoy</p>
                      <p className={`text-xs font-semibold ${C.ink}`}>
                        {fmtAmount(cashProjectionPoints[0]!.value, isConsolidated || effectiveCurrency === "USD" ? "USD" : "UYU")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[10px] ${C.muted}`}>Después de pagos</p>
                      <p className={`text-xs font-semibold ${cashProjectionPoints[1]!.value < 0 ? "text-red-600" : C.ink}`}>
                        {fmtAmount(cashProjectionPoints[1]!.value, isConsolidated || effectiveCurrency === "USD" ? "USD" : "UYU")}
                      </p>
                    </div>
                  </div>
                  <Link href="/copilot/tesoreria" className={`mt-2 flex items-center gap-1 text-[10px] ${C.accent} hover:underline`}>
                    Ver Tesorería <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className={`text-xs ${C.muted}`}>Configurá Tesorería para ver la proyección.</p>
                  <Link href="/copilot/tesoreria" className={`mt-2 inline-block text-xs ${C.accent} hover:underline`}>
                    Ir a Tesorería →
                  </Link>
                </div>
              )}
            </ChartCard>
          </div>
        </section>

        {/* Tables section */}
        <section aria-label="Tablas operativas">
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${C.muted}`}>
                  Clientes con deuda activa
                </h2>
                <Link
                  href="/copilot/cartera"
                  className={`flex items-center gap-1 text-xs ${C.accent} hover:underline`}
                >
                  Ver toda la cartera <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {loading ? (
                <Skeleton className="h-40" />
              ) : (
                <ActiveDebtClientsTable
                  rows={isConsolidated ? consolidatedActiveDebtRows : activeDebtRows}
                  selectedCurrency={isConsolidated ? "USD" : effectiveCurrencyForTables}
                />
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${C.muted}`}>
                  Movimientos recientes del período
                </h2>
                <Link
                  href="/copilot/datos"
                  className={`flex items-center gap-1 text-xs ${C.accent} hover:underline`}
                >
                  Ver todos los datos <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {loading ? (
                <Skeleton className="h-40" />
              ) : (
                <RecentMovementsTable
                  movements={recentMovements}
                  selectedCurrency={effectiveCurrencyForTables}
                  exchangeRate={isConsolidated ? exchangeRate : null}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
