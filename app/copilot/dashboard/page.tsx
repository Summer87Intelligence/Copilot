"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  Download,
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
  determineDashboardState,
  extractClientStates,
  extractDashboardCurrencyData,
  extractMonthlyPoint,
  extractRecentMovements,
  extractTopBilling,
  extractTopDebtors,
  getLastNMonthRanges,
  type DashboardCurrencyData,
  type DashboardClientStates,
  type DashboardMonthlyPoint,
  type DashboardRecentMovement,
  type DashboardTopBilling,
  type DashboardTopDebtor,
  type DashboardState,
} from "@/lib/copilot-dashboard-summary";
import { METRIC_LABEL } from "@/lib/copilot-financial-metrics-contract";

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

function fmtCompact(n: number, currency?: string): string {
  const prefix = currency === "USD" ? "U$S " : currency === "UYU" ? "$ " : "";
  if (Math.abs(n) >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${n.toFixed(0)}`;
}

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
  height = 100,
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

  const barH = height - 18;
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
        return (
          <div
            key={i}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            style={{ height }}
          >
            <div
              className="flex w-full items-end gap-px"
              style={{ height: barH }}
            >
              {selectedCurrency !== "USD" && (d.uyu ?? 0) > 0 ? (
                <div
                  title={`UYU ${fmtCompact(d.uyu ?? 0)}`}
                  className="flex-1 rounded-t bg-[var(--copilot-accent)] opacity-90"
                  style={{ height: uyuH }}
                />
              ) : null}
              {selectedCurrency !== "UYU" && (d.usd ?? 0) > 0 ? (
                <div
                  title={`USD ${fmtCompact(d.usd ?? 0, "USD")}`}
                  className="flex-1 rounded-t bg-blue-500 opacity-80"
                  style={{ height: usdH }}
                />
              ) : null}
              {(d.uyu ?? 0) === 0 && (d.usd ?? 0) === 0 ? (
                <div className="flex-1 rounded-t bg-[var(--copilot-border)]" style={{ height: 2 }} />
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
  height = 100,
}: {
  groups: { label: string; a: number; b: number; aLabel: string; bLabel: string }[];
  height?: number;
}) {
  const maxVal = Math.max(...groups.flatMap((g) => [g.a, g.b]), 1);
  const barH = height - 18;
  return (
    <div className="flex items-end gap-1 overflow-hidden" style={{ height }}>
      {groups.map((g, i) => (
        <div
          key={i}
          className="flex min-w-0 flex-1 flex-col items-center justify-end"
          style={{ height }}
        >
          <div className="flex w-full items-end gap-0.5" style={{ height: barH }}>
            <div
              title={`${g.aLabel}: ${fmtCompact(g.a)}`}
              className="flex-1 rounded-t bg-[var(--copilot-accent)] opacity-90"
              style={{ height: Math.max(1, (g.a / maxVal) * barH) }}
            />
            <div
              title={`${g.bLabel}: ${fmtCompact(g.b)}`}
              className="flex-1 rounded-t bg-emerald-400"
              style={{ height: Math.max(1, (g.b / maxVal) * barH) }}
            />
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
}: {
  items: { label: string; value: number; id?: string }[];
  color?: string;
  href?: (id: string) => string;
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
            <div className="relative flex-1 h-3 rounded-full overflow-hidden bg-[var(--copilot-border)]">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <p className={`w-14 shrink-0 text-right text-[10px] font-medium ${C.ink}`}>
              {fmtCompact(item.value)}
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
// Chart: Donut (SVG)
// ---------------------------------------------------------------------------

function DonutChart({
  segments,
  size = 72,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return <p className={`py-4 text-center text-xs ${C.muted}`}>Sin datos</p>;
  }
  const R = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const segAngles = segments.map((seg) => (seg.value / total) * 2 * Math.PI);
  const paths = segments.map((seg, i) => {
    const startAngle = segAngles.slice(0, i).reduce((s, a) => s + a, -Math.PI / 2);
    const angle = segAngles[i]!;
    const endAngle = startAngle + angle;
    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`, color: seg.color };
  });

  return (
    <div className="flex items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
      >
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} />
        ))}
        <circle cx={cx} cy={cy} r={R * 0.52} fill="var(--copilot-card-bg)" />
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <p className={`min-w-0 truncate text-[10px] leading-tight ${C.muted}`}>
              {seg.label}
            </p>
            <p className={`ml-auto shrink-0 text-[10px] font-semibold ${C.ink}`}>
              {seg.value}
            </p>
          </div>
        ))}
      </div>
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
      label: "OK",
      icon: <CheckCircle className="h-4 w-4" />,
      bg: "bg-emerald-50 border-emerald-200",
      text: "text-emerald-800",
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

  const totalVencida =
    (uyu?.deudaVencida ?? 0) + (usd?.deudaVencida ?? 0);
  const mainRisk =
    state === "critical"
      ? clientStates.riesgoAlto > 0
        ? `${clientStates.riesgoAlto} cliente${clientStates.riesgoAlto > 1 ? "s" : ""} de riesgo alto`
        : "Caja insuficiente para cubrir pagos próximos"
      : state === "attention"
      ? totalVencida > 0
        ? `Deuda vencida activa en cartera`
        : `${clientStates.conDeudaVencida} cliente${clientStates.conDeudaVencida > 1 ? "s" : ""} con deuda vencida`
      : null;

  const bestSignal =
    (uyu?.efectividad ?? 0) >= 0.8 || (usd?.efectividad ?? 0) >= 0.8
      ? "Efectividad de cobros superior al 80%"
      : clientStates.sinDeuda > clientStates.conDeudaVencida
      ? "Mayoría de clientes sin deuda activa"
      : null;

  const suggestedAction =
    state === "critical"
      ? "Revisar clientes críticos y cobertura de caja en Tesorería"
      : state === "attention"
      ? "Gestionar deuda vencida en Cartera → clientes pendientes"
      : "Mantener seguimiento de agenda de cobranza";

  return (
    <div className={`rounded-2xl border p-5 ${stateConfig.bg}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className={`flex items-center gap-1.5 ${stateConfig.text}`}>
          {stateConfig.icon}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateConfig.badge}`}
          >
            {stateConfig.label}
          </span>
        </div>
        <p className={`text-sm font-semibold ${stateConfig.text}`}>
          Resumen ejecutivo — {periodLabel}
        </p>
      </div>

      <div className={`mt-3 space-y-1 text-xs leading-relaxed ${stateConfig.text}`}>
        {uyu && (
          <p>
            En el período se facturaron{" "}
            <strong>{fmtAmount(uyu.facturado, "UYU")}</strong> UYU
            {usd ? ` y ${fmtAmount(usd.facturado, "USD")} USD.` : "."}
          </p>
        )}
        {uyu && (
          <p>
            Se cobraron <strong>{fmtAmount(uyu.cobrado, "UYU")}</strong> UYU
            {usd ? ` y ${fmtAmount(usd.cobrado, "USD")} USD.` : "."}
          </p>
        )}
        <p>
          La deuda activa actual es{" "}
          {uyu ? <strong>{fmtAmount(uyu.deudaActiva, "UYU")} UYU</strong> : null}
          {uyu && usd ? " y " : null}
          {usd ? <strong>{fmtAmount(usd.deudaActiva, "USD")} USD</strong> : null}.
        </p>
        <p>
          Hay <strong>{clientStates.total - clientStates.sinDeuda}</strong>{" "}
          cliente{clientStates.total - clientStates.sinDeuda !== 1 ? "s" : ""} con
          deuda activa; <strong>{clientStates.conDeudaVencida + clientStates.riesgoAlto}</strong>{" "}
          tienen deuda vencida.
        </p>
        {uyu?.cajaDespPagos !== undefined && (
          <p>
            La caja después de pagos se mantiene{" "}
            <strong>
              {uyu.cajaDespPagos >= 0 ? "positiva" : "negativa"}
            </strong>{" "}
            en UYU.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {mainRisk && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${stateConfig.badge}`}>
            <AlertTriangle className="h-3 w-3" />
            Riesgo principal: {mainRisk}
          </span>
        )}
        {bestSignal && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
            <TrendingUp className="h-3 w-3" />
            {bestSignal}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-800">
          <ArrowRight className="h-3 w-3" />
          {suggestedAction}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Critical clients table
// ---------------------------------------------------------------------------

function CriticalClientsTable({
  debtors,
  selectedCurrency,
}: {
  debtors: DashboardTopDebtor[];
  selectedCurrency: "all" | "UYU" | "USD";
}) {
  const filtered = debtors
    .filter((d) =>
      selectedCurrency === "USD"
        ? d.debtUSD > 0
        : selectedCurrency === "UYU"
        ? d.debtUYU > 0
        : d.debtUYU + d.debtUSD > 0
    )
    .filter((d) => d.overdueUYU > 0 || d.overdueUSD > 0 || d.risk === "Alto")
    .slice(0, 10);

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--copilot-border)] p-6 text-center">
        <CheckCircle className="mx-auto h-5 w-5 text-emerald-600 mb-2" />
        <p className={`text-sm ${C.muted}`}>No hay clientes críticos en este período.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]">
            {["Cliente", "Deuda UYU", "Deuda USD", "Vencido UYU", "Vencido USD", "Atraso", "Acciones"].map(
              (h) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-left font-semibold tracking-wide ${C.muted}`}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.map((d, i) => (
            <tr
              key={d.companyId}
              className={`border-b border-[var(--copilot-border)] ${i % 2 === 0 ? "bg-[var(--copilot-card-bg)]" : "bg-[var(--copilot-table-row-alt-bg)]"} hover:bg-[var(--copilot-table-row-hover-bg)]`}
            >
              <td className={`px-3 py-2 font-medium ${C.ink}`}>{d.name}</td>
              <td className="px-3 py-2 tabular-nums">{fmtCompact(d.debtUYU)}</td>
              <td className="px-3 py-2 tabular-nums">{fmtCompact(d.debtUSD, "USD")}</td>
              <td className={`px-3 py-2 tabular-nums ${d.overdueUYU > 0 ? "font-semibold text-amber-700" : C.muted}`}>
                {d.overdueUYU > 0 ? fmtCompact(d.overdueUYU) : "—"}
              </td>
              <td className={`px-3 py-2 tabular-nums ${d.overdueUSD > 0 ? "font-semibold text-amber-700" : C.muted}`}>
                {d.overdueUSD > 0 ? fmtCompact(d.overdueUSD, "USD") : "—"}
              </td>
              <td className={`px-3 py-2 ${C.muted}`}>
                {Math.max(d.overdueDaysUYU ?? 0, d.overdueDaysUSD ?? 0) > 0
                  ? `${Math.max(d.overdueDaysUYU ?? 0, d.overdueDaysUSD ?? 0)}d`
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <Link
                    href={`/copilot/clientes/${d.companyId}`}
                    className={`hover:underline ${C.accent}`}
                  >
                    Ver ficha
                  </Link>
                  <Link
                    href={`/copilot/clientes/${d.companyId}?tab=estado-cuenta`}
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
  );
}

// ---------------------------------------------------------------------------
// Recent movements table
// ---------------------------------------------------------------------------

function RecentMovementsTable({
  movements,
}: {
  movements: DashboardRecentMovement[];
}) {
  if (movements.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--copilot-border)] p-6 text-center">
        <p className={`text-sm ${C.muted}`}>No hay movimientos recientes en este período.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]">
            {["Fecha", "Tipo", "Cliente", "Comprobante", "Moneda", "Importe", "Saldo"].map(
              (h) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-left font-semibold tracking-wide ${C.muted}`}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {movements.map((m, i) => (
            <tr
              key={i}
              className={`border-b border-[var(--copilot-border)] ${i % 2 === 0 ? "bg-[var(--copilot-card-bg)]" : "bg-[var(--copilot-table-row-alt-bg)]"} hover:bg-[var(--copilot-table-row-hover-bg)]`}
            >
              <td className={`px-3 py-2 tabular-nums ${C.muted}`}>{fmtDate(m.date)}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${m.type === "factura" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {m.type === "factura" ? "Factura" : "Recibo"}
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
              <td className={`px-3 py-2 ${C.muted}`}>{m.currency}</td>
              <td className={`px-3 py-2 tabular-nums font-medium ${C.ink}`}>
                {fmtAmount(m.amount, m.currency)}
              </td>
              <td
                className={`px-3 py-2 tabular-nums ${m.balance > 0 ? "text-amber-700" : C.muted}`}
              >
                {m.balance > 0 ? fmtAmount(m.balance, m.currency) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [selectedCurrency, setSelectedCurrency] = useState<"all" | "UYU" | "USD">("all");

  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Data state
  const [currencyData, setCurrencyData] = useState<DashboardCurrencyData[]>([]);
  const [topDebtors, setTopDebtors] = useState<DashboardTopDebtor[]>([]);
  const [topBilling, setTopBilling] = useState<DashboardTopBilling[]>([]);
  const [clientStates, setClientStates] = useState<DashboardClientStates>({
    sinDeuda: 0, conDeudaAlDia: 0, conDeudaVencida: 0, riesgoAlto: 0, total: 0,
  });
  const [monthlyData, setMonthlyData] = useState<DashboardMonthlyPoint[]>([]);
  const [recentMovements, setRecentMovements] = useState<DashboardRecentMovement[]>([]);
  const abortRef = useRef<AbortController | null>(null);

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

      const pastMonths = getLastNMonthRanges(today, 5);
      const monthQueries = pastMonths.map((m) =>
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
        ...monthlyRes
      ] = await Promise.allSettled([
        copilotApiFetch("/api/copilot/rutas-hub", { signal: sig }),
        copilotApiFetch("/api/copilot/financial-reconciliation?mode=all_outstanding", { signal: sig }),
        copilotApiFetch(`/api/copilot/financial-reconciliation?${periodQ}`, { signal: sig }),
        copilotApiFetch("/api/copilot/treasury/cash-position", { signal: sig }),
        copilotApiFetch("/api/copilot/treasury/scheduled-payments?include_summary=1&horizon_days=30", { signal: sig }),
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

      // ── Treasury ──
      let cashPositions: CashPositionByCurrency[] = [];
      let outflowSummaries: TreasuryOutflowSummary[] = [];

      if (cashRes.status === "fulfilled") {
        const j = (await cashRes.value.json().catch(() => null)) as { positions?: CashPositionByCurrency[] } | null;
        cashPositions = j?.positions ?? (Array.isArray(j) ? (j as CashPositionByCurrency[]) : []);
      }
      if (outflowRes.status === "fulfilled") {
        const j = (await outflowRes.value.json().catch(() => null)) as { summaries?: TreasuryOutflowSummary[]; summary?: TreasuryOutflowSummary[] } | null;
        outflowSummaries = j?.summaries ?? j?.summary ?? [];
      }

      // ── Monthly trend ──
      const parsedMonthly: DashboardMonthlyPoint[] = [];
      for (let i = 0; i < monthlyRes.length; i++) {
        const res = monthlyRes[i];
        const meta = pastMonths[i];
        if (!meta) continue;
        let report: FinancialConsistencyReport | null = null;
        if (res?.status === "fulfilled") {
          const j = (await (res as PromiseFulfilledResult<Response>).value.json().catch(() => null)) as { report?: FinancialConsistencyReport } | null;
          report = j?.report ?? null;
        }
        parsedMonthly.push(extractMonthlyPoint(report, meta.yearMonth));
      }
      // Add current period as the last point
      const currentYearMonth = confirmedTo.slice(0, 7);
      parsedMonthly.push(extractMonthlyPoint(periodReport, currentYearMonth));

      // ── Derived data ──
      const newCurrData = extractDashboardCurrencyData({
        periodReport,
        outstandingReport,
        cashPositions,
        outflowSummaries,
      });

      if (sig.aborted) return;
      setCurrencyData(newCurrData);
      setTopDebtors(extractTopDebtors(portfolioRows));
      setTopBilling(extractTopBilling(portfolioRows));
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

  // Prepare monthly chart data
  const monthlyIssued: BarData[] = monthlyData.map((p) => ({
    label: p.monthLabel,
    uyu: p.issuedUYU,
    usd: p.issuedUSD,
  }));
  const monthlyCollected: BarData[] = monthlyData.map((p) => ({
    label: p.monthLabel,
    uyu: p.collectedUYU,
    usd: p.collectedUSD,
  }));

  // Ventas vs Cobros (current period)
  const vsGroups = [
    ...(selectedCurrency !== "USD" && (uyu?.facturado ?? 0) + (uyu?.cobrado ?? 0) > 0
      ? [{ label: "UYU", a: uyu?.facturado ?? 0, b: uyu?.cobrado ?? 0, aLabel: "Facturado", bLabel: "Cobrado" }]
      : []),
    ...(selectedCurrency !== "UYU" && (usd?.facturado ?? 0) + (usd?.cobrado ?? 0) > 0
      ? [{ label: "USD", a: usd?.facturado ?? 0, b: usd?.cobrado ?? 0, aLabel: "Facturado", bLabel: "Cobrado" }]
      : []),
  ];

  // Aging (all outstanding)
  const agingUYU = uyu?.aging ?? [];
  const agingUSD = usd?.aging ?? [];
  const agingLabels = ["0-30", "31-60", "61-90", "90+"];
  const agingBars: BarData[] = agingLabels.map((lbl) => ({
    label: lbl,
    uyu: agingUYU.find((b) => b.label === lbl)?.amount ?? 0,
    usd: agingUSD.find((b) => b.label === lbl)?.amount ?? 0,
  }));

  // Top debtors
  const debtorItems = topDebtors.map((d) => ({
    label: d.name,
    value: selectedCurrency === "USD" ? d.debtUSD : d.debtUYU,
    id: d.companyId,
  })).filter((d) => d.value > 0);

  // Top billing
  const billingItems = topBilling.map((d) => ({
    label: d.name,
    value: selectedCurrency === "USD" ? d.billingUSD : d.billingUYU,
    id: d.companyId,
  })).filter((d) => d.value > 0);

  // Client states donut
  const clientDonutSegments = [
    { label: "Sin deuda", value: clientStates.sinDeuda, color: "#d1fae5" },
    { label: "Deuda al día", value: clientStates.conDeudaAlDia, color: "#10b981" },
    { label: "Deuda vencida", value: clientStates.conDeudaVencida, color: "#f59e0b" },
    { label: "Riesgo alto", value: clientStates.riesgoAlto, color: "#ef4444" },
  ].filter((s) => s.value > 0);

  // Currency distribution donut (by debt)
  const currDistSegments = [
    { label: `UYU ${fmtCompact(uyu?.deudaActiva ?? 0)}`, value: Math.round(uyu?.deudaActiva ?? 0), color: "var(--copilot-accent)" },
    { label: `USD ${fmtCompact(usd?.deudaActiva ?? 0, "USD")}`, value: Math.round(usd?.deudaActiva ?? 0), color: "#3b82f6" },
  ].filter((s) => s.value > 0);

  // Cash projection (area chart)
  const cashProjectionPoints = [
    ...(uyu?.cajaDisponible !== undefined
      ? [
          { label: "Hoy", value: uyu.cajaDisponible },
          { label: "−pagos", value: uyu.cajaDespPagos },
        ]
      : []),
  ];

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
            <button
              type="button"
              disabled
              title="Exportar PDF — Próximamente"
              className={`${C.btnGhost} opacity-50 cursor-not-allowed`}
            >
              <Download className="h-3 w-3" />
              Exportar PDF
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
            onChange={(e) => setSelectedCurrency(e.target.value as "all" | "UYU" | "USD")}
            className={C.input}
            aria-label="Filtrar por moneda"
          >
            <option value="all">Todas las monedas</option>
            <option value="UYU">Solo UYU</option>
            <option value="USD">Solo USD</option>
          </select>
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
            currencyData={currencyData}
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                title={METRIC_LABEL.facturado_periodo}
                tooltip="Facturas emitidas en el período, neto de notas de crédito. Fuente: reconciliación financiera."
                uyuValue={uyu?.facturado ?? 0}
                usdValue={usd?.facturado ?? 0}
                selectedCurrency={selectedCurrency}
                href="/copilot/cartera"
              />
              <KpiCard
                title={METRIC_LABEL.cobrado_periodo}
                tooltip="Recibos registrados en el período (recibos reales de Zeta). Fuente: reconciliación financiera."
                uyuValue={uyu?.cobrado ?? 0}
                usdValue={usd?.cobrado ?? 0}
                selectedCurrency={selectedCurrency}
                href="/copilot/cartera"
              />
              <KpiCard
                title={METRIC_LABEL.deuda_activa}
                tooltip="Saldo pendiente activo de clientes (dedupeado, sin filas shadow Zeta). Valor al momento actual, sin filtro de período."
                uyuValue={uyu?.deudaActiva ?? 0}
                usdValue={usd?.deudaActiva ?? 0}
                selectedCurrency={selectedCurrency}
                href="/copilot/cartera"
                secondary="Deuda activa actual — no depende del período seleccionado."
              />
              <KpiCard
                title={METRIC_LABEL.deuda_vencida}
                tooltip="Saldo vencido: buckets 31-60 + 61-90 + 90+ días desde due_date. Sin filtro de período."
                uyuValue={uyu?.deudaVencida ?? 0}
                usdValue={usd?.deudaVencida ?? 0}
                selectedCurrency={selectedCurrency}
                href="/copilot/cartera"
                negative
              />
              <KpiCard
                title={METRIC_LABEL.caja_disponible}
                tooltip="Dinero disponible en Tesorería: apertura + cobros + movimientos manuales."
                uyuValue={uyu?.cajaDisponible ?? 0}
                usdValue={usd?.cajaDisponible ?? 0}
                selectedCurrency={selectedCurrency}
                href="/copilot/tesoreria"
              />
              <KpiCard
                title={METRIC_LABEL.caja_despues_pagos}
                tooltip="Caja disponible menos pagos programados en los próximos 30 días. Negativo = déficit."
                uyuValue={uyu?.cajaDespPagos ?? 0}
                usdValue={usd?.cajaDespPagos ?? 0}
                selectedCurrency={selectedCurrency}
                href="/copilot/tesoreria"
                negative
              />
            </div>
          )}
        </section>

        {/* Charts row 1: monthly trends */}
        <section aria-label="Tendencia mensual">
          <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wide ${C.muted}`}>
            Tendencia mensual (últimos 6 meses)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ChartCard
              title="[1] Ventas por mes"
              subtitle="Facturado del período por moneda"
              badge={<ChartLegend selectedCurrency={selectedCurrency} />}
            >
              {loading ? (
                <Skeleton className="h-28" />
              ) : (
                <VerticalBarChart
                  data={monthlyIssued}
                  selectedCurrency={selectedCurrency}
                  height={110}
                  emptyText="Sin facturación en este rango"
                />
              )}
            </ChartCard>

            <ChartCard
              title="[2] Cobros por mes"
              subtitle="Recibos registrados por moneda"
              badge={<ChartLegend selectedCurrency={selectedCurrency} />}
            >
              {loading ? (
                <Skeleton className="h-28" />
              ) : (
                <VerticalBarChart
                  data={monthlyCollected}
                  selectedCurrency={selectedCurrency}
                  height={110}
                  emptyText="Sin cobros registrados"
                />
              )}
            </ChartCard>

            <ChartCard
              title="[3] Ventas vs Cobros"
              subtitle="Período seleccionado · Verde = cobrado"
            >
              {loading ? (
                <Skeleton className="h-28" />
              ) : vsGroups.length > 0 ? (
                <GroupedBarChart groups={vsGroups} height={110} />
              ) : (
                <p className={`py-6 text-center text-xs ${C.muted}`}>
                  Sin datos en el período
                </p>
              )}
              <div className="mt-2 flex gap-3">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-3 rounded-sm bg-[var(--copilot-accent)]" />
                  <p className={`text-[10px] ${C.muted}`}>Facturado</p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-3 rounded-sm bg-emerald-400" />
                  <p className={`text-[10px] ${C.muted}`}>Cobrado</p>
                </div>
              </div>
            </ChartCard>
          </div>
        </section>

        {/* Charts row 2: aging + effectiveness */}
        <section aria-label="Antigüedad y efectividad">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChartCard
              title="[4] Deuda por antigüedad"
              subtitle="Basado en due_date · Estado actual, sin filtro de período"
              badge={<ChartLegend selectedCurrency={selectedCurrency} />}
            >
              {loading ? (
                <Skeleton className="h-28" />
              ) : (
                <VerticalBarChart
                  data={agingBars}
                  selectedCurrency={selectedCurrency}
                  height={110}
                  emptyText="Sin deuda vencida"
                />
              )}
            </ChartCard>

            <ChartCard
              title="[10] Efectividad de cobros"
              subtitle="Cobrado del período / Facturado neto · Por moneda"
            >
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6" />
                  <Skeleton className="h-6" />
                </div>
              ) : currencyData.length === 0 ? (
                <p className={`py-4 text-center text-xs ${C.muted}`}>Sin datos</p>
              ) : (
                <div className="space-y-4">
                  {currencyData.map((d) => (
                    <GaugeRow
                      key={d.currency}
                      label="Efectividad"
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="[5] Top 10 clientes deudores"
              subtitle={`Deuda activa ${selectedCurrency === "all" ? "UYU" : selectedCurrency} · Clic para ver ficha`}
            >
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-5" />
                  ))}
                </div>
              ) : (
                <HorizontalBarChart
                  items={debtorItems.slice(0, 10)}
                  color="var(--copilot-accent)"
                  href={(id) => `/copilot/clientes/${id}`}
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
                  items={billingItems.slice(0, 10)}
                  color="#3b82f6"
                  href={(id) => `/copilot/clientes/${id}`}
                />
              )}
            </ChartCard>
          </div>
        </section>

        {/* Charts row 4: client states + currency distribution + cash projection */}
        <section aria-label="Distribución y proyección">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ChartCard
              title="[7] Clientes por estado"
              subtitle="Estado actual de la cartera comercial"
            >
              {loading ? (
                <Skeleton className="h-20" />
              ) : (
                <DonutChart segments={clientDonutSegments} />
              )}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                <Link href="/copilot/clientes" className={`text-[10px] ${C.accent} hover:underline flex items-center gap-1`}>
                  <Users className="h-3 w-3" />
                  Ver clientes
                </Link>
                <Link href="/copilot/cartera?filter=overdue" className={`text-[10px] ${C.muted} hover:underline`}>
                  Ver vencidos →
                </Link>
              </div>
            </ChartCard>

            <ChartCard
              title="[8] Distribución por moneda"
              subtitle="Deuda activa — UYU vs USD (sin conversión)"
            >
              {loading ? (
                <Skeleton className="h-20" />
              ) : (
                <>
                  <DonutChart segments={currDistSegments} />
                  <p className={`mt-2 text-[9px] ${C.muted}`}>
                    Sin conversión de tipo de cambio. Los valores no son comparables entre monedas.
                  </p>
                </>
              )}
            </ChartCard>

            <ChartCard
              title="[9] Caja proyectada 30 días"
              subtitle="UYU · Disponible hoy y después de pagos programados"
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
                        {fmtCompact(uyu?.cajaDisponible ?? 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[10px] ${C.muted}`}>Después de pagos</p>
                      <p className={`text-xs font-semibold ${(uyu?.cajaDespPagos ?? 0) < 0 ? "text-red-600" : C.ink}`}>
                        {fmtCompact(uyu?.cajaDespPagos ?? 0)}
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
                  Clientes críticos
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
                <CriticalClientsTable
                  debtors={topDebtors}
                  selectedCurrency={selectedCurrency}
                />
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${C.muted}`}>
                  Movimientos recientes
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
                <RecentMovementsTable movements={recentMovements} />
              )}
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <div className={`rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]/60 p-3 text-[10px] ${C.muted}`}>
          <p>
            <strong className={C.ink}>Fuentes:</strong>{" "}
            Facturado / Cobrado: reconciliación financiera (recibos reales Zeta, período seleccionado) ·
            Deuda activa / Vencida: estado actual, sin filtro de período ·
            Aging: basado en due_date ·
            Caja: Tesorería manual ·
            Facturación histórica por cliente: all-time, no filtrable por período desde esta vista.
          </p>
          <p className="mt-1">
            Este dashboard es operativo. Para decisiones de cierre financiero, validá con el export
            oficial de Zeta.
          </p>
        </div>
      </div>
    </div>
  );
}
