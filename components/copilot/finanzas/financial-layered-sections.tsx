"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { fmtMoney } from "@/components/copilot/finanzas/financial-executive-shared";
import {
  statusBadgeVariants,
  softCalloutClass,
  subtleLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type {
  ComparisonMetric,
  ExecutiveCurrencyPanel,
  FinancialExecutiveDashboard,
} from "@/lib/copilot-financial-executive-dashboard";
import { riskBadgeTone } from "@/lib/copilot-financial-executive-dashboard";
import { formatPanoramaRate } from "@/lib/copilot-financial-panorama-model";
import type { FinancialPanoramaModel, PanoramaCurrencySlice } from "@/lib/copilot-financial-panorama-model";
import type { PanoramaMetricId } from "@/lib/copilot-financial-panorama-details";
import {
  FinancialCurrencyBreakdown,
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
      className="inline-flex rounded-xl border border-[var(--copilot-border)] bg-slate-50/80 p-0.5"
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
  const { panorama, periodContext: ctx } = dashboard;
  const tone = riskBadgeTone(panorama.risk.level);
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
            Ventas netas, cobros, deuda, caja y evolución del negocio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeVariants[tone]}`}
          >
            Riesgo {panorama.risk.label}
          </span>
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

      <p className="rounded-lg border border-[var(--copilot-border)] bg-white/60 px-3 py-2 text-xs text-[var(--copilot-ink-muted)]">
        <span className="font-medium text-[var(--copilot-ink)]">Corte:</span> {ctx.asOfLabel}
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-medium text-[var(--copilot-ink)]">Mes en curso:</span> {monthShort}
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-medium text-[var(--copilot-ink)]">Último cerrado:</span>{" "}
        {closedShort} {ctx.lastClosedMonthLabel.split(" ")[1]}
        <span className="mx-1.5 text-slate-300">·</span>
        UYU/USD separados
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
}: {
  label: string;
  value: string;
  tone?: "positive" | "danger" | "neutral" | "warning";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-800"
      : tone === "danger"
        ? "text-rose-700"
        : tone === "warning"
          ? "text-amber-800"
          : "text-[var(--copilot-ink)]";
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/80 px-3 py-2.5">
      <p className={subtleLabelClass}>{label}</p>
      <p className={`mt-1 text-sm font-bold tabular-nums leading-snug ${valueClass}`}>{value}</p>
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
  const bullets = dashboard.executiveBullets.slice(0, 3);
  const tone = riskBadgeTone(panorama.risk.level);

  const cashUyu = panorama.projection.cashTodayUyu;
  const cashUsd = panorama.projection.cashTodayUsd;

  const closedSales = dualLine(panels, (p) => p.lastClosedSnapshot?.netSales ?? 0);
  const closedColl = dualLine(panels, (p) => p.lastClosedSnapshot?.collected ?? 0);
  const debtTotal = dualLine(panels, (p) => p.slice?.pending ?? 0);
  const debtOverdue = dualLine(panels, (p) => p.slice?.overdue ?? 0);

  const cashParts: string[] = [];
  if (cashUyu !== 0) cashParts.push(fmtMoney(cashUyu, "UYU"));
  if (cashUsd !== 0) cashParts.push(fmtMoney(cashUsd, "USD"));

  return (
    <CopilotCard className="border-[rgba(31,107,74,0.14)] bg-[rgba(31,107,74,0.02)]">
      <CopilotSectionTitle
        title="Resumen ejecutivo"
        subtitle="Fuentes: Tesorería, Cartera, facturas y recibos."
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryMetric
          label="Caja disponible"
          value={cashParts.length > 0 ? cashParts.join(" · ") : "Consultar Tesorería"}
          tone="positive"
        />
        <SummaryMetric
          label={`Ventas netas · ${dashboard.periodContext.lastClosedMonthLabel}`}
          value={closedSales}
        />
        <SummaryMetric
          label={`Cobros · ${dashboard.periodContext.lastClosedMonthLabel}`}
          value={closedColl}
        />
        <SummaryMetric label="Deuda total actual" value={debtTotal} />
        <SummaryMetric
          label="Deuda vencida actual"
          value={debtOverdue}
          tone={panels.some((p) => (p.slice?.overdue ?? 0) > 0) ? "danger" : "neutral"}
        />
        <SummaryMetric
          label="Estado general"
          value={panorama.risk.label}
          tone={tone === "critical" ? "danger" : tone === "attention" ? "warning" : "positive"}
        />
      </div>

      {bullets.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-[var(--copilot-border)]/60 pt-3">
          {bullets.map((line) => (
            <li key={line} className="flex gap-2 text-xs leading-relaxed text-[var(--copilot-ink)]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

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
}: {
  dashboard: FinancialExecutiveDashboard;
}) {
  const panels = dashboard.currencies;
  const available = panels.map((p) => p.currency);
  const [currency, setCurrency] = useState<"UYU" | "USD">(available[0] ?? "UYU");

  useEffect(() => {
    if (!available.includes(currency) && available[0]) setCurrency(available[0]);
  }, [available, currency]);

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

  return (
    <CopilotCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CopilotSectionTitle
          title="Comparación principal"
          subtitle="Meses cerrados por fecha de comprobante/recibo."
        />
        <CurrencyToggle value={currency} onChange={setCurrency} available={available} />
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
        <table className="w-full min-w-[360px] text-left text-xs">
          <thead>
            <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              <th className="px-3 py-2 font-semibold">Métrica</th>
              <th className="px-3 py-2 text-right font-semibold">{colRecent}</th>
              <th className="px-3 py-2 text-right font-semibold">{colPrevious}</th>
              <th className="px-3 py-2 text-right font-semibold">Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-[var(--copilot-border)]/60">
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
          , cobros{" "}
          {colInProgress?.current != null && colInProgress.current > 0
            ? fmtMoney(colInProgress.current, currency)
            : "—"}
          {daysMetric?.current != null && daysMetric.previous != null
            ? ` · ${daysMetric.current}/${daysMetric.previous} días transcurridos`
            : null}
          .
        </p>
      ) : null}
    </CopilotCard>
  );
}

// ─── E. Riesgo de cobranza ────────────────────────────────────────────────────

export function FinancialCollectionRisk({
  panels,
}: {
  panels: ExecutiveCurrencyPanel[];
}) {
  const available = panels.map((p) => p.currency);
  const [currency, setCurrency] = useState<"UYU" | "USD">(available[0] ?? "UYU");

  useEffect(() => {
    if (!available.includes(currency) && available[0]) setCurrency(available[0]);
  }, [available, currency]);

  const panel = panels.find((p) => p.currency === currency);
  if (!panel) return null;

  const cd = panel.collectionDebt;

  return (
    <CopilotCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CopilotSectionTitle
          title="Riesgo de cobranza"
          subtitle="Fuente: Cartera actual."
        />
        <CurrencyToggle value={currency} onChange={setCurrency} available={available} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SummaryMetric label="Deuda total" value={fmtMoney(cd.totalDebt, currency)} />
        <SummaryMetric
          label="Deuda vencida"
          value={fmtMoney(cd.overdueDebt, currency)}
          tone={cd.overdueDebt > 0 ? "danger" : "neutral"}
        />
        <SummaryMetric
          label="% vencido"
          value={cd.overduePct != null ? formatPanoramaRate(cd.overduePct) : "—"}
          tone={cd.overduePct != null && cd.overduePct > 0.3 ? "warning" : "neutral"}
        />
      </div>

      {panel.topOverdue.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
          <table className="w-full min-w-[400px] text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
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
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700">
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
        <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">Sin deuda vencida en {currency}.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <CopilotGhostLink href="/copilot/cartera">Ver clientes vencidos</CopilotGhostLink>
        <CopilotGhostLink href="/copilot/reportes">Generar reporte de deudores</CopilotGhostLink>
      </div>
    </CopilotCard>
  );
}

// ─── F. Proyección 30 días (compacta) ─────────────────────────────────────────

export function FinancialProjectionCompact({
  model,
}: {
  model: FinancialPanoramaModel;
}) {
  const p = model.projection;
  const cash =
    p.cashTodayUyu > 0 || p.cashTodayUsd > 0
      ? [p.cashTodayUyu > 0 ? fmtMoney(p.cashTodayUyu, "UYU") : null, p.cashTodayUsd > 0 ? fmtMoney(p.cashTodayUsd, "USD") : null]
          .filter(Boolean)
          .join(" · ")
      : "—";

  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Próximos 30 días"
        subtitle="Estimación operativa. No es saldo bancario ni cierre contable."
      />
      <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
        Fuente: Tesorería + cartera ponderada.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric label="Caja disponible" value={cash} tone="positive" />
        <SummaryMetric label="Cobros esperados" value={fmtMoney(p.expectedCollections, null)} />
        <SummaryMetric
          label="Pagos próximos"
          value={p.hasOutflows ? fmtMoney(p.upcomingOutflows, null) : "—"}
          tone={p.hasOutflows ? "warning" : "neutral"}
        />
        <SummaryMetric
          label="Escenario estimado"
          value={fmtMoney(p.estimatedCash30d, null)}
          tone={p.estimatedCash30d < 0 ? "danger" : "positive"}
        />
      </div>
      {!p.hasOutflows ? (
        <p className="mt-2 text-[11px] text-amber-800/90">
          Sin pagos cargados; la proyección puede estar incompleta.{" "}
          <Link href="/copilot/tesoreria?section=programados" className="font-semibold underline">
            Cargar pago
          </Link>
        </p>
      ) : null}
    </CopilotCard>
  );
}

// ─── G. Detalle avanzado ──────────────────────────────────────────────────────

function WeekComparisonMini({ panel }: { panel: ExecutiveCurrencyPanel }) {
  const block = panel.weekVsPrevious;
  const paired = block.metrics.slice(0, 3);
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/60 p-3">
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
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/40">
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
            Tablas para análisis contable, concentración y auditoría.
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
                          ? "bg-white text-[var(--copilot-ink)] shadow-sm"
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

          <FinancialCurrencyBreakdown model={dashboard.panorama} defaultOpen />

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
