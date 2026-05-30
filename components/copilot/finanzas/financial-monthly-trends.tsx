"use client";

import { useEffect, useMemo, useState } from "react";

import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import {
  buildFinancialTrendDashboard,
  buildFinancialMonthlyTrends,
  type FinancialTrendDashboard,
  type TrendPoint,
  type MonthlyTrendInvoiceInput,
  type MonthlyTrendReceiptInput,
} from "@/lib/copilot-financial-monthly-trends";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Period = "7d" | "1m" | "3m" | "6m" | "12m";

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "7d", label: "7 días" },
  { id: "1m", label: "Este mes" },
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

function fmtAxisLabel(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
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
  const cls = positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
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
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        <p className="text-sm font-bold tabular-nums leading-tight text-[var(--copilot-ink)]">
          {value}
        </p>
        {delta}
      </div>
      {sub ? (
        <p className="mt-0.5 truncate text-[10px] text-[var(--copilot-ink-muted)]">{sub}</p>
      ) : null}
    </div>
  );
}

// ─── SVG Chart ──────────────────────────────────────────────────────────────────

const VB_W = 640;
const VB_H = 200;
const PAD_L = 50;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 38;
const CW = VB_W - PAD_L - PAD_R;
const CH = VB_H - PAD_T - PAD_B;

function toSvgY(value: number, maxY: number): number {
  if (maxY === 0) return PAD_T + CH;
  return PAD_T + CH - (value / maxY) * CH;
}

function TrendChart({
  points,
  currency,
}: {
  points: TrendPoint[];
  currency: "UYU" | "USD";
}) {
  if (points.length === 0) return null;

  const maxY = Math.max(
    1,
    ...points.flatMap((p) => [p.netSales, p.collections, p.creditNotes]),
  );

  const n = points.length;
  const step = CW / n;
  const px = (i: number) => PAD_L + (i + 0.5) * step;
  const py = (v: number) => toSvgY(v, maxY);

  const salesPts = points.map((p, i) => `${px(i)},${py(p.netSales)}`).join(" ");
  const collPts = points.map((p, i) => `${px(i)},${py(p.collections)}`).join(" ");

  const gridSteps = [0.25, 0.5, 0.75, 1.0];
  const barW = Math.max(2, Math.min(step * 0.45, 22));

  // Show at most 12 x-axis labels
  const labelEvery = n <= 12 ? 1 : Math.ceil(n / 12);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      aria-label="Gráfico de evolución comercial"
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
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text x={PAD_L - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">
              {fmtAxisLabel(maxY * s)}
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <line
        x1={PAD_L}
        y1={PAD_T + CH}
        x2={PAD_L + CW}
        y2={PAD_T + CH}
        stroke="#d1d5db"
        strokeWidth="1"
      />

      {/* Credit note bars */}
      {points.map((p, i) => {
        if (p.creditNotes <= 0) return null;
        const barH = (p.creditNotes / maxY) * CH;
        return (
          <rect
            key={`nc-${p.key}`}
            x={px(i) - barW / 2}
            y={py(p.creditNotes)}
            width={barW}
            height={barH}
            fill="#fca5a5"
            fillOpacity={0.65}
            rx="2"
          >
            <title>{`${p.label} — NC: ${fmt(p.creditNotes, currency)}`}</title>
          </rect>
        );
      })}

      {/* Collections line */}
      <polyline
        points={collPts}
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) =>
        p.collections > 0 ? (
          <circle key={`col-${p.key}`} cx={px(i)} cy={py(p.collections)} r="3" fill="#38bdf8">
            <title>{`${p.label} — Cobros: ${fmt(p.collections, currency)}`}</title>
          </circle>
        ) : null,
      )}

      {/* Net sales line — drawn last, on top */}
      <polyline
        points={salesPts}
        fill="none"
        stroke="#34d399"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) =>
        p.netSales > 0 ? (
          <circle key={`ns-${p.key}`} cx={px(i)} cy={py(p.netSales)} r="3.5" fill="#34d399">
            <title>{`${p.label} — Ventas netas: ${fmt(p.netSales, currency)}`}</title>
          </circle>
        ) : null,
      )}

      {/* X axis labels */}
      {points.map((p, i) => {
        if (i % labelEvery !== 0) return null;
        return (
          <text
            key={`xl-${p.key}`}
            x={px(i)}
            y={PAD_T + CH + 16}
            textAnchor="middle"
            fontSize="9"
            fill="#9ca3af"
          >
            {p.label}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Compact table ──────────────────────────────────────────────────────────────

function TrendTable({
  points,
  currency,
}: {
  points: TrendPoint[];
  currency: "UYU" | "USD";
}) {
  const rows = points.slice(-12);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-left text-[11px]">
        <thead>
          <tr>
            {["Período", "Ventas netas", "Cobros", "NC", "Tasa cobro"].map((h) => (
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
          {rows.map((p) => (
            <tr key={p.key} className="hover:bg-slate-50/60">
              <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 font-medium text-[var(--copilot-ink)]">
                {p.label}
              </td>
              <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 tabular-nums text-emerald-700">
                {p.netSales > 0 ? fmt(p.netSales, currency) : "—"}
              </td>
              <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 tabular-nums text-sky-700">
                {p.collections > 0 ? fmt(p.collections, currency) : "—"}
              </td>
              <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 tabular-nums text-rose-500">
                {p.creditNotes > 0 ? fmt(p.creditNotes, currency) : "—"}
              </td>
              <td className="border-b border-[var(--copilot-border)] px-2 py-1.5 tabular-nums text-[var(--copilot-ink)]">
                {p.collectionRate != null
                  ? p.collectionRate > 1
                    ? `${fmtPct(p.collectionRate)} ↑`
                    : fmtPct(p.collectionRate)
                  : "—"}
              </td>
            </tr>
          ))}
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
}: {
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
  asOfYmd: string;
}) {
  const [period, setPeriod] = useState<Period>("6m");
  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");

  // Detect which currencies have data (scan last 12 months)
  const { hasUyu, hasUsd } = useMemo(() => {
    const scan = buildFinancialMonthlyTrends({ invoices, receipts, asOfYmd, monthsBack: 12 });
    return {
      hasUyu: scan.trends.some((t) => t.currency === "UYU"),
      hasUsd: scan.trends.some((t) => t.currency === "USD"),
    };
  }, [invoices, receipts, asOfYmd]);

  useEffect(() => {
    if (!hasUyu && hasUsd) setCurrency("USD");
  }, [hasUyu, hasUsd]);

  const dashboard = useMemo(
    () => buildFinancialTrendDashboard({ invoices, receipts, asOfYmd, period, currency }),
    [invoices, receipts, asOfYmd, period, currency],
  );

  const { totals, previousTotals, deltas, best, gap, insights, points } = dashboard;

  const isEmpty = points.every(
    (p) => p.netSales === 0 && p.collections === 0 && p.creditNotes === 0,
  );

  const highRate = totals.collectionRate !== null && totals.collectionRate > 1;

  const gapLabel =
    gap.salesMinusCollections > 0
      ? "Faltan cobrar"
      : gap.salesMinusCollections < 0
        ? "Recuperado"
        : "Brecha";

  return (
    <CopilotCard>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CopilotSectionTitle
          title="Evolución comercial"
          subtitle="Ventas netas, cobros y notas de crédito por período."
        />
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div
            className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 p-0.5"
            role="tablist"
            aria-label="Período"
          >
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                  period === p.id
                    ? "bg-white text-[var(--copilot-ink)] shadow-sm ring-1 ring-[var(--copilot-border)]"
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
              className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 p-0.5"
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
                        ? "bg-white text-[var(--copilot-ink)] shadow-sm ring-1 ring-[var(--copilot-border)]"
                        : has
                          ? "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
                          : "cursor-not-allowed text-slate-300"
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

      {isEmpty ? (
        <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
          No hay datos suficientes para el período seleccionado.
        </p>
      ) : (
        <>
          {/* KPI row */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Ventas netas"
              value={fmt(totals.netSales, currency)}
              delta={<DeltaBadge pct={deltas.netSalesPct} />}
              sub={
                previousTotals
                  ? `Anterior: ${fmt(previousTotals.netSales, currency)}`
                  : undefined
              }
            />
            <KpiCard
              label="Cobros"
              value={fmt(totals.collections, currency)}
              delta={<DeltaBadge pct={deltas.collectionsPct} />}
              sub={
                previousTotals
                  ? `Anterior: ${fmt(previousTotals.collections, currency)}`
                  : undefined
              }
            />
            <KpiCard
              label="Notas de crédito"
              value={totals.creditNotes > 0 ? fmt(totals.creditNotes, currency) : "—"}
              delta={
                totals.creditNotes > 0 ? (
                  <DeltaBadge pct={deltas.creditNotesPct} invertColor />
                ) : undefined
              }
            />
            <KpiCard
              label="Tasa de cobro"
              value={totals.collectionRate != null ? fmtPct(totals.collectionRate) : "—"}
              delta={<DeltaBadge pts={deltas.collectionRatePoints} />}
              sub={
                previousTotals?.collectionRate != null
                  ? `Anterior: ${fmtPct(previousTotals.collectionRate)}`
                  : undefined
              }
            />
            <KpiCard
              label="Mejor período"
              value={best.netSalesPeriod?.label ?? "—"}
              sub={
                best.netSalesPeriod
                  ? fmt(best.netSalesPeriod.value, currency)
                  : undefined
              }
            />
            <KpiCard
              label={gapLabel}
              value={fmt(Math.abs(gap.salesMinusCollections), currency)}
              sub={gap.label}
            />
          </div>

          {/* High collection rate alert */}
          {highRate ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>Tasa de cobro {fmtPct(totals.collectionRate!)}.</strong> Cobraste más de lo
              vendido en este período — puede incluir recuperación de deuda de períodos anteriores.
            </div>
          ) : null}

          {/* Chart */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--copilot-border)] bg-white/60 px-3 pb-2 pt-3">
            <div style={{ minWidth: Math.max(points.length * 36, 280) }}>
              <TrendChart points={points} currency={currency} />
            </div>
          </div>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-5 rounded-full bg-emerald-400" aria-hidden />
              Ventas netas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-5 rounded-full bg-sky-400" aria-hidden />
              Cobros
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-300" aria-hidden />
              Notas de crédito (barra)
            </span>
          </div>

          {/* Insights */}
          {insights.length > 0 ? (
            <div className="mt-4 rounded-xl border border-[var(--copilot-border)] bg-slate-50/70 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Lectura rápida
              </p>
              <ul className="space-y-1.5">
                {insights.map((ins, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-[var(--copilot-ink)]"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Data table */}
          <div className="mt-4 border-t border-[var(--copilot-border)] pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Detalle por período
            </p>
            <TrendTable points={points} currency={currency} />
          </div>
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
        Ventas netas = facturación menos notas de crédito. Cobros = recibos registrados. No es
        cierre contable formal. UYU y USD se analizan por separado.
      </p>
    </CopilotCard>
  );
}
