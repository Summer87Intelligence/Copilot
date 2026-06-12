"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { fmtMoney } from "@/components/copilot/finanzas/financial-executive-shared";
import { softCalloutClass, subtleLabelClass } from "@/components/copilot/ui/copilot-visual-system";
import type {
  ComparisonMetric,
  ExecutiveCurrencyPanel,
  FinancialExecutiveDashboard,
} from "@/lib/copilot-financial-executive-dashboard";
import { riskBadgeTone } from "@/lib/copilot-financial-executive-dashboard";
import { FINANCIAL_UX_COPY, FINANZAS_COPY } from "@/lib/copilot-financial-ux-copy";
import { formatPanoramaRate } from "@/lib/copilot-financial-panorama-model";
import type { FinancialPanoramaModel, PanoramaCurrencySlice, PanoramaProjectionCurrency } from "@/lib/copilot-financial-panorama-model";
import type { PanoramaMetricId } from "@/lib/copilot-financial-panorama-details";
import {
  FinancialTopClientsSection,
} from "@/components/copilot/finanzas/financial-executive-sections";

// ─── Shared ───────────────────────────────────────────────────────────────────

function CurrencyToggle({
  value,
  onChange,
  available,
}: {
  value: "UYU" | "USD";
  onChange: (c: "UYU" | "USD") => void;
  available: readonly ("UYU" | "USD")[];
}) {
  if (available.length <= 1) return null;
  return (
    <div
      className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-0.5"
      role="tablist"
      aria-label="Moneda"
    >
      {(["UYU", "USD"] as const).map((c) => {
        const has = available.includes(c);
        return (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={value === c}
            disabled={!has}
            onClick={() => has && onChange(c)}
            className={`min-w-[44px] rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
              value === c
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
  );
}

function dualLine(
  panels: ExecutiveCurrencyPanel[],
  pick: (p: ExecutiveCurrencyPanel) => number
): string {
  const parts = panels
    .map((p) => {
      const n = pick(p);
      return n !== 0 ? fmtMoney(n, p.currency) : null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function dualLineAll(
  panels: ExecutiveCurrencyPanel[],
  pick: (p: ExecutiveCurrencyPanel) => number
): string {
  if (panels.length === 0) return "—";
  return panels.map((p) => fmtMoney(pick(p), p.currency)).join(" · ");
}

function pctVar(current: number | null, previous: number | null): string {
  if (current == null || previous == null || previous === 0) return "—";
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}

// ─── A. Header ────────────────────────────────────────────────────────────────

export function FinancialLayeredHeader({
  dashboard,
}: {
  dashboard: FinancialExecutiveDashboard;
}) {
  const { periodContext: ctx } = dashboard;
  const monthShort = ctx.currentMonthLabel.split(" ")[0]?.toLowerCase() ?? "mes actual";
  const closedShort = ctx.lastClosedMonthLabel.split(" ")[0]?.toLowerCase() ?? "mes cerrado";
  const prevClosedShort =
    ctx.previousClosedMonthLabel.split(" ")[0]?.toLowerCase() ?? "mes anterior";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--copilot-ink)]">Panorama financiero</h2>
          <p className="mt-0.5 text-sm text-[var(--copilot-ink-muted)]">
            {FINANZAS_COPY.heroSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopilotGhostLink href="/copilot/reportes" className="text-xs">
            Reportes
          </CopilotGhostLink>
          <CopilotGhostLink href="/copilot/tesoreria" className="text-xs">
            Tesorería
          </CopilotGhostLink>
          <CopilotGhostLink href="/copilot/cartera" className="text-xs">
            Cartera
          </CopilotGhostLink>
        </div>
      </div>

      <p className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-3 py-2 text-xs text-[var(--copilot-ink-muted)]">
        <span className="font-medium text-[var(--copilot-ink)]">Corte:</span> {ctx.asOfLabel}
        <span className="mx-1.5 text-[var(--copilot-subtle)]">·</span>
        <span className="font-medium text-[var(--copilot-ink)]">Mes en curso:</span> {monthShort}
        <span className="mx-1.5 text-[var(--copilot-subtle)]">·</span>
        <span className="font-medium text-[var(--copilot-ink)]">Último cerrado:</span>{" "}
        {closedShort} {ctx.lastClosedMonthLabel.split(" ")[1]}
        <span className="mx-1.5 text-[var(--copilot-subtle)]">·</span>
        UYU/USD separados
      </p>

      <p className="text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
        {FINANZAS_COPY.heroRiskNote}
      </p>

      {ctx.isCurrentMonthPartial ? (
        <p className="text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {monthShort.charAt(0).toUpperCase() + monthShort.slice(1)} está en curso. Para comparar
          meses completos usamos {closedShort} vs {prevClosedShort}.
        </p>
      ) : null}
    </div>
  );
}

// ─── B. Resumen ejecutivo ───────────────────────────────────────────────────

function SummaryMetric({
  label,
  value,
  tone = "neutral",
  tooltip,
  hero = false,
}: {
  label: string;
  value: string;
  tone?: "positive" | "danger" | "neutral" | "warning";
  tooltip?: string;
  hero?: boolean;
}) {
  const valueClass =
    tone === "positive"
      ? "text-[var(--copilot-success-text-strong)]"
      : tone === "danger"
        ? "text-[var(--copilot-danger-text)]"
        : tone === "warning"
          ? "text-[var(--copilot-warning-text-strong)]"
          : "text-[var(--copilot-ink)]";
  return (
    <div
      className={`rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 ${
        hero ? "px-4 py-3.5" : "px-3 py-2.5"
      }`}
      title={tooltip}
    >
      <p className={subtleLabelClass}>{label}</p>
      <p
        className={`mt-1 tabular-nums leading-snug ${
          hero ? "text-lg font-bold sm:text-xl" : "text-sm font-bold"
        } ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export function FinancialCollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-[var(--copilot-ink)]">{title}</span>
          {subtitle ? (
            <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">{subtitle}</span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-[var(--copilot-border)] px-4 py-4">{children}</div> : null}
    </div>
  );
}

export function FinancialExecutiveSummary({
  dashboard,
  onSelectMetric,
}: {
  dashboard: FinancialExecutiveDashboard;
  onSelectMetric?: (metricId: PanoramaMetricId, slice: PanoramaCurrencySlice) => void;
}) {
  const { panorama, currencies: panels } = dashboard;
  const tone = riskBadgeTone(panorama.risk.level);

  const cashUyu = panorama.projection.cashTodayUyu;
  const cashUsd = panorama.projection.cashTodayUsd;

  const debtTotal = dualLineAll(panels, (p) => p.slice?.pending ?? 0);
  const debtOverdue = dualLineAll(
    panels,
    (p) => p.collectionDebt.overdueDebt
  );

  const cashParts: string[] = [];
  if (cashUyu !== 0) cashParts.push(fmtMoney(cashUyu, "UYU"));
  if (cashUsd !== 0) cashParts.push(fmtMoney(cashUsd, "USD"));

  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Foto actual"
        subtitle="Caja, pendiente y riesgo al corte de hoy."
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric
          label={FINANZAS_COPY.labelCajaHoy}
          value={cashParts.length > 0 ? cashParts.join(" · ") : "Consultar Tesorería"}
          tooltip={FINANZAS_COPY.summaryCajaTooltip}
          hero
        />
        <SummaryMetric
          label={FINANZAS_COPY.labelDeudaHoy}
          value={debtTotal}
          tooltip={FINANZAS_COPY.summaryDeudaTooltip}
          hero
        />
        <SummaryMetric
          label={FINANZAS_COPY.labelDeudaVencidaHoy}
          value={debtOverdue}
          tone={panels.some((p) => p.collectionDebt.overdueDebt > 0) ? "danger" : "neutral"}
          tooltip={FINANZAS_COPY.summaryDeudaVencidaTooltip}
          hero
        />
        <SummaryMetric
          label="Riesgo financiero"
          value={panorama.risk.label}
          tone={tone === "critical" ? "danger" : tone === "attention" ? "warning" : "neutral"}
          tooltip={FINANZAS_COPY.summaryEstadoTooltip}
          hero
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <CopilotPrimaryLink href={panorama.priorityCta.href} className="text-xs">
          {panorama.priorityCta.label}
          <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </CopilotPrimaryLink>
        {panels.map((p) =>
          p.slice && onSelectMetric ? (
            <button
              key={p.currency}
              type="button"
              onClick={() => onSelectMetric("pending", p.slice!)}
              className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
            >
              Detalle {p.currency}
            </button>
          ) : null
        )}
      </div>
    </CopilotCard>
  );
}

// ─── C. Comparación principal ─────────────────────────────────────────────────

export function FinancialMainComparison({
  dashboard,
  embedded = false,
}: {
  dashboard: FinancialExecutiveDashboard;
  embedded?: boolean;
}) {
  const panels = dashboard.currencies;
  const available = panels.map((p) => p.currency);
  const availableKey = available.join(",");
  const [currency, setCurrency] = useState<"UYU" | "USD">(available[0] ?? "UYU");
  const [appliedAvailableKey, setAppliedAvailableKey] = useState(availableKey);

  if (appliedAvailableKey !== availableKey) {
    setAppliedAvailableKey(availableKey);
    if (!available.includes(currency) && available[0]) {
      setCurrency(available[0]);
    }
  }

  const panel = panels.find((p) => p.currency === currency);
  if (!panel) return null;

  const closed = panel.lastClosedMonthComparison;
  const inProgress = panel.currentMonthInProgress;
  const titleParts = closed.title.split(" vs ");
  const colRecent = titleParts[0] ?? "Reciente";
  const colPrevious = titleParts[1] ?? "Anterior";

  const rows = closed.metrics.filter((m) =>
    ["net", "col", "nc", "gap"].includes(m.id)
  );

  const fmtCell = (m: ComparisonMetric, which: "current" | "previous") => {
    const v = which === "current" ? m.current : m.previous;
    if (v == null) return "—";
    if (m.format === "percent") return formatPanoramaRate(v);
    if (v === 0 && m.format === "money") return "—";
    return fmtMoney(v, currency);
  };

  const daysMetric = inProgress.metrics.find((m) => m.id === "days");
  const netInProgress = inProgress.metrics.find((m) => m.id === "net");
  const colInProgress = inProgress.metrics.find((m) => m.id === "col");
  const ctx = dashboard.periodContext;
  const monthName = ctx.currentMonthLabel.split(" ")[0] ?? "Mes";

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {embedded ? (
          <div>
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">
              {FINANZAS_COPY.comparisonTitle}
            </p>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              {FINANZAS_COPY.comparisonSubtitle}
            </p>
          </div>
        ) : (
          <CopilotSectionTitle
            title={FINANZAS_COPY.comparisonTitle}
            subtitle={FINANZAS_COPY.comparisonSubtitle}
          />
        )}
        <CurrencyToggle value={currency} onChange={setCurrency} available={available} />
      </div>

      <div className={`${embedded ? "mt-3" : "mt-3"} overflow-x-auto rounded-xl border border-[var(--copilot-border)]`}>
        <table className="w-full min-w-[360px] text-left text-xs">
          <thead>
            <tr className="bg-[var(--copilot-soft-bg)] text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              <th className="px-3 py-2 font-semibold">Métrica</th>
              <th className="px-3 py-2 text-right font-semibold">{colRecent}</th>
              <th className="px-3 py-2 text-right font-semibold">{colPrevious}</th>
              <th className="px-3 py-2 text-right font-semibold">Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.id}
                className="border-t border-[var(--copilot-border)]/60"
                title={m.id === "gap" ? FINANZAS_COPY.comparisonGapTooltip : undefined}
              >
                <td className="px-3 py-2 text-[var(--copilot-ink-muted)]">{m.label}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtCell(m, "current")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--copilot-ink-muted)]">
                  {fmtCell(m, "previous")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--copilot-ink-muted)]">
                  {pctVar(m.current, m.previous)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ctx.isCurrentMonthPartial ? (
        <p className={`mt-3 ${softCalloutClass} px-3 py-2 text-xs text-[var(--copilot-ink)]`}>
          <span className="font-semibold">{monthName} está en curso:</span> ventas{" "}
          {netInProgress?.current != null && netInProgress.current > 0
            ? fmtMoney(netInProgress.current, currency)
            : "—"}
          , {FINANZAS_COPY.labelCobrosRegistrados.toLowerCase()}{" "}
          {colInProgress?.current != null && colInProgress.current > 0
            ? fmtMoney(colInProgress.current, currency)
            : "—"}
          {daysMetric?.current != null && daysMetric.previous != null
            ? ` · ${daysMetric.current}/${daysMetric.previous} días transcurridos`
            : null}
          .
        </p>
      ) : null}
    </>
  );

  if (embedded) return body;
  return <CopilotCard>{body}</CopilotCard>;
}

// ─── E. Riesgo de cobranza ────────────────────────────────────────────────────

export function FinancialCollectionRisk({
  panels,
  embedded = false,
}: {
  panels: ExecutiveCurrencyPanel[];
  embedded?: boolean;
}) {
  const available = panels.map((p) => p.currency);
  const availableKey = available.join(",");
  const [currency, setCurrency] = useState<"UYU" | "USD">(available[0] ?? "UYU");
  const [appliedAvailableKey, setAppliedAvailableKey] = useState(availableKey);

  if (appliedAvailableKey !== availableKey) {
    setAppliedAvailableKey(availableKey);
    if (!available.includes(currency) && available[0]) {
      setCurrency(available[0]);
    }
  }

  const panel = panels.find((p) => p.currency === currency);
  if (!panel) return null;

  const cd = panel.collectionDebt;

  const body = (
    <>
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CopilotSectionTitle
            title={FINANZAS_COPY.collectionRiskTitle}
            subtitle={FINANZAS_COPY.collectionRiskSubtitle}
          />
          <CurrencyToggle value={currency} onChange={setCurrency} available={available} />
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <CurrencyToggle value={currency} onChange={setCurrency} available={available} />
        </div>
      )}

      <div className={`${embedded ? "" : "mt-3"} grid gap-2 sm:grid-cols-3`}>
        <SummaryMetric label="Total pendiente" value={fmtMoney(cd.totalDebt, currency)} />
        <SummaryMetric
          label="Atrasado"
          value={fmtMoney(cd.overdueDebt, currency)}
          tone={cd.overdueDebt > 0 ? "danger" : "neutral"}
        />
        <SummaryMetric
          label="% atrasado"
          value={cd.overduePct != null ? formatPanoramaRate(cd.overduePct) : "—"}
          tone={cd.overduePct != null && cd.overduePct > 0.3 ? "warning" : "neutral"}
        />
      </div>

      {panel.topOverdue.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
          <table className="w-full min-w-[400px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--copilot-soft-bg)] text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2 text-right">Deuda</th>
                <th className="px-3 py-2 text-right">Vencida</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {panel.topOverdue.map((row) => (
                <tr key={row.companyId} className="border-t border-[var(--copilot-border)]">
                  <td className="px-3 py-2 font-medium">{row.clientName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(row.totalDebt, currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--copilot-danger-text)]">
                    {fmtMoney(row.overdueDebt, currency)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/copilot/clientes/${row.companyId}`}
                      className="font-semibold text-[var(--copilot-accent)] hover:underline"
                    >
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">Sin atrasos en {currency}.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <CopilotGhostLink href="/copilot/cartera">Ver clientes vencidos</CopilotGhostLink>
        <CopilotGhostLink href="/copilot/reportes">Generar reporte de deudores</CopilotGhostLink>
      </div>
    </>
  );

  if (embedded) return body;
  return <CopilotCard>{body}</CopilotCard>;
}

function dualCurrencyValueNode(
  blocks: readonly PanoramaProjectionCurrency[],
  pick: (b: PanoramaProjectionCurrency) => number,
  options?: { showZero?: boolean }
): ReactNode {
  if (blocks.length === 0) {
    return <span className="text-sm text-[var(--copilot-ink-muted)]">Sin movimientos registrados</span>;
  }
  const lines = (["UYU", "USD"] as const)
    .map((code) => {
      const block = blocks.find((b) => b.currency === code);
      if (!block) return null;
      const n = pick(block);
      if (n === 0 && !options?.showZero && block.cashToday === 0) return null;
      return (
        <div key={code} className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {code}
          </span>
          <span className="font-semibold tabular-nums">{fmtMoney(n, code)}</span>
        </div>
      );
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return <span className="text-sm text-[var(--copilot-ink-muted)]">—</span>;
  }
  return <div className="space-y-1">{lines}</div>;
}

function ProjectionCurrencyMiniBlock({ block }: { block: PanoramaProjectionCurrency }) {
  const afterPayments = block.hasOutflows ? block.safeCash30d : block.cashToday;
  const maxVal = Math.max(block.cashToday, Math.abs(afterPayments), 1);
  const todayPct = Math.max(0, Math.min(100, (block.cashToday / maxVal) * 100));
  const afterPct = Math.max(0, Math.min(100, (Math.max(afterPayments, 0) / maxVal) * 100));

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 p-3">
      <p className="text-xs font-semibold text-[var(--copilot-ink)]">
        Caja proyectada 30 días — {block.currency}
      </p>
      <div className="mt-2 space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Disponible hoy</span>
          <span className="font-semibold tabular-nums">{fmtMoney(block.cashToday, block.currency)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Después de pagos</span>
          <span
            className={`font-semibold tabular-nums ${
              afterPayments < 0 ? "text-[var(--copilot-danger-text)]" : "text-[var(--copilot-ink)]"
            }`}
          >
            {fmtMoney(afterPayments, block.currency)}
          </span>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
          <div
            className="h-full rounded-full bg-[var(--copilot-accent)]/70"
            style={{ width: `${todayPct}%` }}
          />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
          <div
            className={`h-full rounded-full ${
              afterPayments < 0 ? "bg-[var(--copilot-danger-text)]/70" : "bg-[var(--copilot-success-text)]/70"
            }`}
            style={{ width: `${afterPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryMetricDual({
  label,
  blocks,
  pick,
  tone = "neutral",
  tooltip,
}: {
  label: string;
  blocks: readonly PanoramaProjectionCurrency[];
  pick: (b: PanoramaProjectionCurrency) => number;
  tone?: "positive" | "danger" | "neutral" | "warning";
  tooltip?: string;
}) {
  const valueClass =
    tone === "positive"
      ? "text-[var(--copilot-success-text-strong)]"
      : tone === "danger"
        ? "text-[var(--copilot-danger-text)]"
        : tone === "warning"
          ? "text-[var(--copilot-warning-text-strong)]"
          : "text-[var(--copilot-ink)]";
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
        {tooltip ? (
          <span className="sr-only"> — {tooltip}</span>
        ) : null}
      </p>
      <div className={`mt-1.5 ${valueClass}`}>{dualCurrencyValueNode(blocks, pick)}</div>
    </div>
  );
}

// ─── F. Proyección 30 días (compacta) ─────────────────────────────────────────

export function FinancialProjectionCompact({
  model,
  embedded = false,
}: {
  model: FinancialPanoramaModel;
  embedded?: boolean;
}) {
  const p = model.projection;
  const blocks = p.byCurrency;
  const anyNegative = blocks.some((b) => b.estimatedCash30d < 0);

  const body = (
    <>
      {!embedded ? (
        <>
          <CopilotSectionTitle
            title="Próximos 30 días"
            subtitle={FINANCIAL_UX_COPY.projection30Subtitle}
          />
        </>
      ) : null}
      <div className={`${embedded ? "mt-3" : "mt-3"} grid gap-2 sm:grid-cols-2 lg:grid-cols-4`}>
        <SummaryMetricDual
          label="Caja para próximos pagos"
          blocks={blocks}
          pick={(b) => b.cashToday}
        />
        <SummaryMetricDual
          label="Cobros esperados"
          blocks={blocks}
          pick={(b) => b.expectedCollections}
          tooltip={FINANZAS_COPY.projectionExpectedCollectionsTooltip}
        />
        <SummaryMetricDual
          label="Pagos registrados"
          blocks={blocks}
          pick={(b) => (b.hasOutflows ? b.upcomingOutflows : 0)}
          tone={p.hasOutflows ? "warning" : "neutral"}
        />
        <SummaryMetricDual
          label={FINANCIAL_UX_COPY.projectionScenarioLabel}
          blocks={blocks}
          pick={(b) => b.estimatedCash30d}
          tone={anyNegative ? "danger" : "neutral"}
          tooltip={FINANZAS_COPY.projectionScenarioTooltip}
        />
      </div>
      {blocks.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {blocks.map((block) => (
            <ProjectionCurrencyMiniBlock key={block.currency} block={block} />
          ))}
        </div>
      ) : null}
      {!p.hasOutflows ? (
        <p className="mt-2 text-[11px] text-[var(--copilot-warning-text-strong)]/90">
          {FINANCIAL_UX_COPY.projectionMissingPaymentsCta}{" "}
          <Link href="/copilot/tesoreria?section=programados" className="font-semibold underline">
            Ir a pagos próximos
          </Link>
        </p>
      ) : null}
    </>
  );

  if (embedded) return body;
  return <CopilotCard>{body}</CopilotCard>;
}

// ─── G. Detalle avanzado ──────────────────────────────────────────────────────

function WeekComparisonMini({ panel }: { panel: ExecutiveCurrencyPanel }) {
  const block = panel.weekVsPrevious;
  const paired = block.metrics.slice(0, 3);
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 p-3">
      <p className="text-xs font-semibold text-[var(--copilot-ink)]">
        Semana · {panel.currency}
      </p>
      <table className="mt-2 w-full text-xs">
        <tbody>
          {paired.map((m) => (
            <tr key={m.id} className="border-t border-[var(--copilot-border)]/50">
              <td className="py-1.5 text-[var(--copilot-ink-muted)]">{m.label}</td>
              <td className="py-1.5 text-right tabular-nums">
                {m.current != null && m.current !== 0 ? fmtMoney(m.current, panel.currency) : "—"}
              </td>
              <td className="py-1.5 text-right tabular-nums text-[var(--copilot-ink-muted)]">
                {m.previous != null && m.previous !== 0
                  ? fmtMoney(m.previous, panel.currency)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinancialAdvancedDetail({
  dashboard,
}: {
  dashboard: FinancialExecutiveDashboard;
}) {
  const [open, setOpen] = useState(false);
  const [clientTab, setClientTab] = useState<"sales" | "debt">("sales");
  const panels = dashboard.currencies;
  const available = panels.map((p) => p.currency);
  const [currency, setCurrency] = useState<"UYU" | "USD">(available[0] ?? "UYU");
  const panel = panels.find((p) => p.currency === currency);

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-[var(--copilot-ink)]">
            Detalle avanzado
          </span>
          <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">
            {FINANZAS_COPY.advancedDetailSubtitle}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="space-y-6 border-t border-[var(--copilot-border)] px-4 py-4">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">Clientes principales</p>
              <div className="flex flex-wrap items-center gap-2">
                <CurrencyToggle value={currency} onChange={setCurrency} available={available} />
                <div className="inline-flex rounded-lg border border-[var(--copilot-border)] p-0.5 text-[10px]">
                  {(["sales", "debt"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setClientTab(t)}
                      className={`rounded-md px-2 py-0.5 font-semibold ${
                        clientTab === t
                          ? "bg-[var(--copilot-card-bg)] text-[var(--copilot-ink)] shadow-sm"
                          : "text-[var(--copilot-ink-muted)]"
                      }`}
                    >
                      {t === "sales" ? "Ventas" : "Deuda"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {panel ? (
              <FinancialTopClientsSection panels={[panel]} mode={clientTab} embedded />
            ) : null}
          </div>

          <p className="text-xs text-[var(--copilot-ink-muted)]">
            La tabla período a período está en «Ver tabla de evolución» dentro de Evolución
            comercial.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {panels.map((p) => (
              <WeekComparisonMini key={p.currency} panel={p} />
            ))}
          </div>

          <div className={`${softCalloutClass} px-3 py-2 text-sm`}>
            <p className="font-semibold text-[var(--copilot-ink)]">Obligaciones fiscales</p>
            <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
              Calendario fiscal y vencimientos en la sección inferior de esta página.
            </p>
            <CopilotGhostLink href="#copilot-finanzas-fiscal" className="mt-2 inline-flex text-xs">
              Ir a obligaciones fiscales
            </CopilotGhostLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
