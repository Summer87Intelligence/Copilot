"use client";

import { useEffect, useMemo, useState } from "react";

import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import {
  buildFinancialTrendDashboard,
  buildFinancialMonthlyTrends,
  type TrendPoint,
  type MonthlyTrendInvoiceInput,
  type MonthlyTrendReceiptInput,
} from "@/lib/copilot-financial-monthly-trends";
import { buildFinancialPeriodContext } from "@/lib/copilot-financial-period-context";
import { FINANZAS_COPY } from "@/lib/copilot-financial-ux-copy";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Period = "7d" | "1m" | "3m" | "6m" | "12m";

type BarPoint = {
  key: string;
  label: string;
  netSales: number;
  collections: number;
  creditNotes: number;
  isEmpty: boolean;
  status?: "Cerrado" | "En curso" | "Sin movimientos";
};

const PERIOD_OPTIONS_FULL: { id: Period; label: string }[] = [
  { id: "7d", label: "7 días" },
  { id: "1m", label: "Este mes" },
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" },
];

const PERIOD_OPTIONS_EXECUTIVE: { id: Period; label: string }[] = [
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, currency: "UYU" | "USD"): string {
  return formatMoneyCurrency(n, currency, { compact: n >= 100_000 });
}

function fmtPct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

function fmtAxis(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Group daily TrendPoints into ~7-day buckets for "Este mes" view. */
function groupToWeeks(daily: TrendPoint[]): BarPoint[] {
  const out: BarPoint[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const ns = r2(chunk.reduce((s, p) => s + p.netSales, 0));
    const co = r2(chunk.reduce((s, p) => s + p.collections, 0));
    const nc = r2(chunk.reduce((s, p) => s + p.creditNotes, 0));
    out.push({
      key: chunk[0].key,
      label: chunk[0].label,
      netSales: ns,
      collections: co,
      creditNotes: nc,
      isEmpty: ns === 0 && co === 0 && nc === 0,
    });
  }
  return out;
}

function periodStatus(
  key: string,
  period: Period,
  ctx: ReturnType<typeof buildFinancialPeriodContext>
): "Cerrado" | "En curso" | "Sin movimientos" {
  if (period === "7d" || period === "1m") {
    return key === ctx.asOfYmd ? "En curso" : "Cerrado";
  }
  if (key === ctx.currentMonthYm && ctx.isCurrentMonthPartial) return "En curso";
  if (key > ctx.currentMonthYm) return "Sin movimientos";
  return "Cerrado";
}

function toBarPoints(
  points: TrendPoint[],
  period: Period,
  ctx: ReturnType<typeof buildFinancialPeriodContext>
): BarPoint[] {
  const src = period === "1m" ? groupToWeeks(points) : points;
  return src
    .filter((p) => {
      if (period === "7d" || period === "1m") return true;
      return p.key <= ctx.currentMonthYm;
    })
    .map((p) => {
      const partial =
        !["7d", "1m"].includes(period) &&
        p.key === ctx.currentMonthYm &&
        ctx.isCurrentMonthPartial;
      return {
        ...p,
        label: partial ? `${p.label} parcial` : p.label,
        isEmpty:
          "isEmpty" in p
            ? (p as BarPoint).isEmpty
            : p.netSales === 0 && p.collections === 0 && p.creditNotes === 0,
        status: periodStatus(p.key, period, ctx),
      };
    });
}

// ─── Delta badge ────────────────────────────────────────────────────────────────

function DeltaBadge({
  pct,
  pts,
  invertColor = false,
}: {
  pct?: number | null;
  pts?: number | null;
  invertColor?: boolean;
}) {
  const val = pct ?? pts;
  if (val == null) return null;
  const isUp = val >= 0;
  const positive = invertColor ? !isUp : isUp;
  const cls = positive ? "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text)]" : "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text)]";
  const arrow = isUp ? "↑" : "↓";
  const text =
    pct != null
      ? `${arrow} ${Math.abs(Math.round(pct * 100))}%`
      : `${arrow} ${Math.abs(Math.round((pts ?? 0) * 100))} pp`;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}>
      {text}
    </span>
  );
}

// ─── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  delta,
  sub,
  tone,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  sub?: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  const valueColor =
    tone === "ok"
      ? "text-[var(--copilot-success-text-strong)]"
      : tone === "warn"
        ? "text-[var(--copilot-warning-text-strong)]"
        : "text-[var(--copilot-ink)]";
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        <p className={`text-sm font-bold tabular-nums leading-tight ${valueColor}`}>{value}</p>
        {delta}
      </div>
      {sub ? (
        <p className="mt-0.5 truncate text-[10px] text-[var(--copilot-ink-muted)]">{sub}</p>
      ) : null}
    </div>
  );
}

// ─── Grouped bar chart ──────────────────────────────────────────────────────────

const VB_W = 640;
const VB_H = 210;
const PAD_L = 54;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 42;
const CW = VB_W - PAD_L - PAD_R;
const CH = VB_H - PAD_T - PAD_B;

function GroupedBarChart({
  bars,
  currency,
}: {
  bars: BarPoint[];
  currency: "UYU" | "USD";
}) {
  const n = bars.length;
  if (n === 0) return null;

  const maxY = Math.max(
    1,
    ...bars.flatMap((b) => [b.netSales, b.collections, b.creditNotes]),
  );

  const groupW = CW / n;
  const maxBarAreaW = Math.min(groupW * 0.82, 96);
  const barW = Math.max(3, (maxBarAreaW - 4) / 3);
  const groupBarTotalW = barW * 3 + 4;

  const baselineY = PAD_T + CH;

  const groupX = (i: number) => PAD_L + i * groupW;
  const barX = (i: number, j: number) => {
    const startX = groupX(i) + (groupW - groupBarTotalW) / 2;
    return startX + j * (barW + 2);
  };
  const py = (v: number) => PAD_T + CH - (v / maxY) * CH;

  const gridSteps = [0.25, 0.5, 0.75, 1.0];
  // Show group value label if few enough groups
  const showGroupLabel = n <= 6;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      aria-label="Gráfico de barras comparativas"
      style={{ overflow: "visible" }}
    >
      {/* Horizontal grid */}
      {gridSteps.map((s) => {
        const y = py(maxY * s);
        return (
          <g key={s}>
            <line
              x1={PAD_L}
              y1={y}
              x2={PAD_L + CW}
              y2={y}
              stroke="#f0f0f0"
              strokeWidth="1"
            />
            <text x={PAD_L - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="#adb5bd">
              {fmtAxis(maxY * s)}
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <line
        x1={PAD_L}
        y1={baselineY}
        x2={PAD_L + CW}
        y2={baselineY}
        stroke="#d1d5db"
        strokeWidth="1"
      />

      {/* Bar groups */}
      {bars.map((b, i) => {
        const tooltip = [
          b.label,
          b.netSales > 0 ? `Ventas: ${fmt(b.netSales, currency)}` : null,
          b.collections > 0 ? `Cobros: ${fmt(b.collections, currency)}` : null,
          b.creditNotes > 0 ? `NC: ${fmt(b.creditNotes, currency)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        const labelY = py(Math.max(b.netSales, b.collections, b.creditNotes, 1)) - 5;
        const groupCx = PAD_L + (i + 0.5) * groupW;

        return (
          <g key={b.key}>
            {/* Transparent hover area for tooltip */}
            <rect
              x={groupX(i)}
              y={PAD_T}
              width={groupW}
              height={CH}
              fill="transparent"
            >
              <title>{tooltip}</title>
            </rect>

            {/* Ventas bar */}
            {b.netSales > 0 ? (
              <rect
                x={barX(i, 0)}
                y={py(b.netSales)}
                width={barW}
                height={(b.netSales / maxY) * CH}
                fill="#34d399"
                fillOpacity={0.9}
                rx="2"
              />
            ) : null}

            {/* Cobros bar */}
            {b.collections > 0 ? (
              <rect
                x={barX(i, 1)}
                y={py(b.collections)}
                width={barW}
                height={(b.collections / maxY) * CH}
                fill="#38bdf8"
                fillOpacity={0.9}
                rx="2"
              />
            ) : null}

            {/* NC bar */}
            {b.creditNotes > 0 ? (
              <rect
                x={barX(i, 2)}
                y={py(b.creditNotes)}
                width={barW}
                height={(b.creditNotes / maxY) * CH}
                fill="#fca5a5"
                fillOpacity={0.85}
                rx="2"
              />
            ) : null}

            {/* Per-group value label (few groups only) */}
            {showGroupLabel && !b.isEmpty && b.netSales > 0 ? (
              <text
                x={groupCx}
                y={labelY}
                textAnchor="middle"
                fontSize="9"
                fill="#6b7280"
                fontWeight="500"
              >
                {fmtAxis(b.netSales)}
              </text>
            ) : null}

            {/* X axis label */}
            <text
              x={groupCx}
              y={baselineY + 16}
              textAnchor="middle"
              fontSize="9"
              fill={b.isEmpty ? "#c9c9c9" : "#9ca3af"}
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Collapsible detail table ───────────────────────────────────────────────────

function DetailTable({
  bars,
  currency,
}: {
  bars: BarPoint[];
  currency: "UYU" | "USD";
}) {
  const rows = bars.filter((b) => !b.isEmpty || b.status === "En curso");
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[11px]">
        <thead>
          <tr>
            {["Período", "Estado", "Ventas", "Cobros", "Diferencia"].map((h) => (
              <th
                key={h}
                className="border-b border-[var(--copilot-border)] px-2 py-1.5 font-semibold text-[var(--copilot-ink-muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const diff = b.netSales - b.collections;
            return (
              <tr key={b.key} className="hover:bg-[var(--copilot-soft-bg)]/60">
                <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 font-medium text-[var(--copilot-ink)]">
                  {b.label}
                </td>
                <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 text-[var(--copilot-ink-muted)]">
                  {b.status ?? "—"}
                </td>
                <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 tabular-nums text-[var(--copilot-success-text)]">
                  {b.netSales > 0 ? fmt(b.netSales, currency) : "—"}
                </td>
                <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 tabular-nums text-sky-700">
                  {b.collections > 0 ? fmt(b.collections, currency) : "—"}
                </td>
                <td
                  className={`border-b border-[var(--copilot-border)] px-2 py-1.5 tabular-nums ${
                    diff > 0
                      ? "text-[var(--copilot-warning-text)]"
                      : diff < 0
                        ? "text-[var(--copilot-success-text)]"
                        : "text-[var(--copilot-ink-muted)]"
                  }`}
                >
                  {diff !== 0 ? (diff > 0 ? `+${fmt(diff, currency)}` : fmt(diff, currency)) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────────────────────

export function FinancialMonthlyTrends({
  invoices,
  receipts,
  asOfYmd,
  executiveView = false,
  embedded = false,
}: {
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
  asOfYmd: string;
  /** Vista principal Finanzas: gráfico protagonista, menos KPIs. */
  executiveView?: boolean;
  /** Sin card exterior; para agrupar en nivel 2 de Finanzas. */
  embedded?: boolean;
}) {
  const [period, setPeriod] = useState<Period>("6m");
  const periodOptions = executiveView ? PERIOD_OPTIONS_EXECUTIVE : PERIOD_OPTIONS_FULL;
  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");
  const [showDetail, setShowDetail] = useState(false);
  const periodContext = useMemo(() => buildFinancialPeriodContext(asOfYmd), [asOfYmd]);

  const { hasUyu, hasUsd, defaultCurrency } = useMemo(() => {
    const scan = buildFinancialMonthlyTrends({ invoices, receipts, asOfYmd, monthsBack: 12 });
    const uyuTotal = scan.trends
      .filter((t) => t.currency === "UYU")
      .reduce((s, t) => s + t.netIssued + t.collected, 0);
    const usdTotal = scan.trends
      .filter((t) => t.currency === "USD")
      .reduce((s, t) => s + t.netIssued + t.collected, 0);
    const hasU = scan.trends.some((t) => t.currency === "UYU");
    const hasD = scan.trends.some((t) => t.currency === "USD");
    let def: "UYU" | "USD" = "UYU";
    if (!hasU && hasD) def = "USD";
    else if (hasU && hasD && usdTotal > uyuTotal) def = "USD";
    return { hasUyu: hasU, hasUsd: hasD, defaultCurrency: def };
  }, [invoices, receipts, asOfYmd]);

  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [defaultCurrency]);

  const dashboard = useMemo(
    () => buildFinancialTrendDashboard({ invoices, receipts, asOfYmd, period, currency }),
    [invoices, receipts, asOfYmd, period, currency],
  );

  const bars = useMemo(
    () => toBarPoints(dashboard.points, period, periodContext),
    [dashboard.points, period, periodContext],
  );

  const { totals, previousTotals, deltas, gap, insights } = dashboard;

  const hasAnyData = bars.some((b) => !b.isEmpty);

  const cobrosSupVentas = totals.collections > totals.netSales && totals.collections > 0;
  const ventasSupCobros = totals.netSales > totals.collections && totals.netSales > 0;

  // Tasa de cobro as small secondary info only if reasonable
  const collRate = totals.collectionRate;
  const showRateHint = collRate !== null && collRate > 0;

  const body = (
    <>
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {embedded ? (
            <div>
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                {executiveView
                  ? FINANZAS_COPY.evolutionTitle
                  : "Evolución comercial desde enero 2026"}
              </p>
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                {executiveView
                  ? FINANZAS_COPY.evolutionSubtitle
                  : "Compara ventas y cobros por período. No incluye meses anteriores a enero 2026."}
              </p>
            </div>
          ) : (
            <CopilotSectionTitle
              title={
                executiveView
                  ? FINANZAS_COPY.evolutionTitle
                  : "Evolución comercial desde enero 2026"
              }
              subtitle={
                executiveView
                  ? FINANZAS_COPY.evolutionSubtitle
                  : "Compara ventas y cobros por período. No incluye meses anteriores a enero 2026."
              }
            />
          )}
          <span className="mt-2 inline-flex rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-tone-neutral-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--copilot-ink-muted)]">
            Datos disponibles: {periodContext.trendsDataRangeLabel}
          </span>
          <p className="mt-1 text-[10px] text-[var(--copilot-ink-muted)]">
            Fuente: ventas y cobros sincronizados desde enero 2026.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div
            className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-0.5"
            role="tablist"
            aria-label="Período"
          >
            {periodOptions.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                  period === p.id
                    ? "bg-[var(--copilot-card-bg)] text-[var(--copilot-ink)] shadow-sm ring-1 ring-[var(--copilot-border)]"
                    : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Currency selector */}
          {(hasUyu || hasUsd) ? (
            <div
              className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-0.5"
              role="tablist"
              aria-label="Moneda"
            >
              {(["UYU", "USD"] as const).map((c) => {
                const has = c === "UYU" ? hasUyu : hasUsd;
                const active = currency === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={!has}
                    onClick={() => has && setCurrency(c)}
                    className={`min-w-[44px] rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                      active
                        ? "bg-[var(--copilot-card-bg)] text-[var(--copilot-ink)] shadow-sm ring-1 ring-[var(--copilot-border)]"
                        : has
                          ? "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
                          : "cursor-not-allowed text-[var(--copilot-subtle)]"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {!hasAnyData ? (
        <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
          No hay datos para el período seleccionado.
        </p>
      ) : (
        <>
          {!executiveView ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <KpiCard
              label="Ventas"
              value={fmt(totals.netSales, currency)}
              delta={<DeltaBadge pct={deltas.netSalesPct} />}
              sub={
                previousTotals
                  ? `Anterior: ${fmt(previousTotals.netSales, currency)}`
                  : "Sin comparación previa"
              }
              tone="ok"
            />
            <KpiCard
              label={FINANZAS_COPY.labelCobrosRegistrados}
              value={fmt(totals.collections, currency)}
              delta={<DeltaBadge pct={deltas.collectionsPct} />}
              sub={
                previousTotals
                  ? `Anterior: ${fmt(previousTotals.collections, currency)}`
                  : "Sin comparación previa"
              }
              tone="ok"
            />
            <KpiCard
              label={cobrosSupVentas ? "Cobraste más de lo vendido" : "Quedó por cobrar"}
              value={fmt(Math.abs(gap.salesMinusCollections), currency)}
              sub={
                cobrosSupVentas
                  ? "Puede incluir facturas de meses anteriores"
                  : ventasSupCobros
                    ? "Diferencia operativa del período"
                    : "Ventas al día"
              }
              tone={cobrosSupVentas ? "ok" : ventasSupCobros ? "warn" : "neutral"}
            />
          </div>
          ) : null}

          {/* Comparison row */}
          {!executiveView && previousTotals ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--copilot-ink-muted)]">
              <span className="font-semibold text-[var(--copilot-ink)]">Vs período anterior:</span>
              <span className="flex items-center gap-1">
                Ventas{" "}
                <DeltaBadge pct={deltas.netSalesPct} />
              </span>
              <span className="flex items-center gap-1">
                Cobros{" "}
                <DeltaBadge pct={deltas.collectionsPct} />
              </span>
              {showRateHint ? (
                <span className="ml-auto text-[10px] tabular-nums text-[var(--copilot-ink-muted)]">
                  Cobros/ventas:{" "}
                  <span className={collRate! > 1 ? "text-[var(--copilot-warning-text)]" : ""}>
                    {fmtPct(collRate!)}
                    {collRate! > 1 ? " — incluye deuda anterior" : ""}
                  </span>
                </span>
              ) : null}
            </div>
          ) : !executiveView ? (
            <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
              Sin comparación previa para este período.
            </p>
          ) : null}

          {/* Alert banners */}
          {!executiveView && cobrosSupVentas ? (
            <div className="mt-3 rounded-lg border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-3 py-2 text-xs text-[var(--copilot-success-text-strong)]">
              Los cobros registrados superan las ventas del período; pueden incluir facturas de meses anteriores.
            </div>
          ) : !executiveView && ventasSupCobros && gap.salesMinusCollections > totals.netSales * 0.3 ? (
            <div className="mt-3 rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]">
              Vendiste más de lo cobrado en este período. Revisá la deuda de clientes.
            </div>
          ) : null}

          <div className={`${executiveView ? "mt-3" : "mt-4"} overflow-x-auto rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-3 pb-2 pt-3`}>
            <div style={{ minWidth: Math.max(bars.length * 44, 280) }}>
              <GroupedBarChart bars={bars} currency={currency} />
            </div>
          </div>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-sm bg-[var(--copilot-status-ok-dot)]" aria-hidden />
              Ventas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-sm bg-sky-400/90" aria-hidden />
              {FINANZAS_COPY.labelCobrosRegistrados}
            </span>
          </div>

          {/* ── Lectura rápida ── */}
          {insights.length > 0 || (executiveView && periodContext.isCurrentMonthPartial) ? (
            <div className="mt-4 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Lectura rápida
              </p>
              <ul className="space-y-1.5">
                {insights.slice(0, 3).map((ins, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[var(--copilot-ink)]">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                    {ins}
                  </li>
                ))}
                {executiveView && periodContext.isCurrentMonthPartial ? (
                  <li className="flex items-start gap-2 text-xs text-[var(--copilot-ink)]">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                    {periodContext.currentMonthLabel} está en curso; no compararlo contra meses
                    cerrados.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {/* ── Collapsible detail table ── */}
          <div className="mt-4 border-t border-[var(--copilot-border)] pt-3">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)] transition"
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: showDetail ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              {showDetail ? "Ocultar tabla" : "Ver tabla de evolución"}
            </button>
            {showDetail ? (
              <div className="mt-3">
                <DetailTable bars={bars} currency={currency} />
              </div>
            ) : null}
          </div>
        </>
      )}

      {!executiveView ? (
        <p className="mt-4 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
          Ventas = facturación del período. {FINANZAS_COPY.labelCobrosRegistrados} = recibos por
          fecha. UYU y USD se analizan por separado. Datos desde enero 2026.
        </p>
      ) : (
        <p className="mt-4 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {FINANZAS_COPY.evolutionSubtitle}
        </p>
      )}
    </>
  );

  if (embedded) return body;
  return <CopilotCard>{body}</CopilotCard>;
}
