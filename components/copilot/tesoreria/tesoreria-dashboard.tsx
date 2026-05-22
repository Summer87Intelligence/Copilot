"use client";

import { CopilotKpiCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import type { TesoreriaCurrencyFilter } from "@/components/copilot/tesoreria/tesoreria-control-bar";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { buildTreasuryAlerts } from "@/lib/treasury/treasury-alert-engine";
import {
  buildTreasuryProjection,
  deriveOpeningBalancesFromManualCash,
} from "@/lib/treasury/treasury-cash-projection";
import {
  computeTreasuryDashboardKpis,
  formatTreasuryMoney,
} from "@/lib/treasury/treasury-dashboard";
import { buildTreasuryInsights } from "@/lib/treasury/treasury-insights";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

type Props = {
  workspace: TreasuryWorkspace;
  currencyFilter: TesoreriaCurrencyFilter;
  asOfDate: string;
};

function pickCurrencyValue(
  filter: TesoreriaCurrencyFilter,
  uyu: number,
  usd: number
): { primary: TreasuryCurrencyCode; value: number } {
  if (filter === "USD") return { primary: "USD", value: usd };
  return { primary: "UYU", value: uyu };
}

function severityClass(severity: "info" | "warning" | "critical"): string {
  if (severity === "critical") return "border-rose-200 bg-rose-50/80 text-rose-950";
  if (severity === "warning") return "border-amber-200 bg-amber-50/80 text-amber-950";
  return "border-sky-200 bg-sky-50/80 text-sky-950";
}

function priorityClass(priority: "low" | "medium" | "high"): string {
  if (priority === "high") return "border-rose-200 bg-rose-50/70";
  if (priority === "medium") return "border-amber-200 bg-amber-50/70";
  return "border-[var(--copilot-border)] bg-white/60";
}

export function TesoreriaDashboard({ workspace, currencyFilter, asOfDate }: Props) {
  if (workspace.loading && workspace.lastFetchedAt == null) {
    return <TesoreriaDashboardSkeleton />;
  }

  const kpis = computeTreasuryDashboardKpis({
    accounts: workspace.accounts,
    manualMovements: workspace.manualMovements,
    bankMovements: workspace.bankMovements,
    obligations: workspace.obligations,
    upcoming7: workspace.upcoming7,
    upcoming30: workspace.upcoming30,
    overdue: workspace.overdue,
    asOfDate,
    currencyFilter,
  });

  const openingBalances = deriveOpeningBalancesFromManualCash(workspace.manualMovements);
  const activeObligations = [...workspace.overdue, ...workspace.upcoming30];
  const projection = buildTreasuryProjection({
    asOfDate,
    horizonDays: 30,
    openingBalances,
    manualMovements: workspace.manualMovements,
    bankMovements: workspace.bankMovements,
    obligations: activeObligations,
    zetaCollections: [],
  });

  const alerts = buildTreasuryAlerts({
    asOfDate,
    obligations: workspace.obligations,
    overdueObligations: workspace.overdue,
    upcomingObligations: workspace.upcoming30,
    manualMovements: workspace.manualMovements,
    bankMovements: workspace.bankMovements,
    projection,
  });

  const insights = buildTreasuryInsights({
    asOfDate,
    alerts,
    projection,
    obligations: activeObligations,
    manualMovements: workspace.manualMovements,
    cashByCurrency: openingBalances,
  });

  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical");
  const activeRisks = alerts.filter((alert) => alert.severity !== "info");
  const latestProjection = projection.snapshots[projection.snapshots.length - 1];
  const currentCash = pickCurrencyValue(
    currencyFilter,
    openingBalances.UYU ?? 0,
    openingBalances.USD ?? 0
  );
  const projectedCash = latestProjection
    ? pickCurrencyValue(
        currencyFilter,
        latestProjection.projectedCashUyu,
        latestProjection.projectedCashUsd
      )
    : currentCash;

  const upcomingOutflows = workspace.upcoming30
    .filter((obligation) => currencyFilter === "all" || obligation.currencyCode === currencyFilter)
    .reduce((sum, obligation) => sum + (obligation.amountFinal ?? obligation.amountEstimated), 0);

  const chartSnapshots = projection.snapshots.slice(0, 31);
  const chartMax = Math.max(
    1,
    ...chartSnapshots.map((snapshot) =>
      Math.abs(
        currencyFilter === "USD" ? snapshot.projectedCashUsd : snapshot.projectedCashUyu
      )
    )
  );

  return (
    <div className="space-y-4">
      {criticalAlerts.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3 shadow-[var(--copilot-shadow)]">
          <CopilotSectionTitle
            title="Alertas críticas"
            subtitle="Riesgos financieros que requieren acción inmediata."
          />
          <ul className="space-y-1.5">
            {criticalAlerts.slice(0, 4).map((alert) => (
              <li key={alert.id} className="rounded-lg border border-rose-200 bg-white/70 px-2.5 py-1.5 text-xs">
                <p className="font-medium text-rose-950">{alert.title}</p>
                <p className="text-rose-900/80">{alert.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <CopilotSectionTitle
          title="KPIs financieros"
          subtitle="Caja actual, proyección, runway y exposición operativa."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CopilotKpiCard
            label={`Caja actual ${currentCash.primary}`}
            value={formatTreasuryMoney(currentCash.value, currentCash.primary)}
            hint="Saldo consolidado manual"
          />
          <CopilotKpiCard
            label={`Caja proyectada ${projectedCash.primary}`}
            value={formatTreasuryMoney(projectedCash.value, projectedCash.primary)}
            hint="Horizonte 30 días"
          />
          <CopilotKpiCard
            label="Runway financiero"
            value={projection.runwayDays == null ? "—" : `${projection.runwayDays} días`}
            hint={`Riesgo ${projection.riskLevel}`}
          />
          <CopilotKpiCard
            label="Egresos próximos 30d"
            value={formatTreasuryMoney(upcomingOutflows, projectedCash.primary)}
            hint={`Obligaciones 7d: ${kpis.obligationsUpcoming7}`}
          />
          <CopilotKpiCard
            label="Obligaciones 30d"
            value={String(kpis.obligationsUpcoming30)}
            hint={`Vencidas: ${kpis.obligationsOverdue}`}
          />
          <CopilotKpiCard
            label="Banco sin conciliar"
            value={String(kpis.unmatchedBankMovements)}
            hint={`Egresos manuales pendientes: ${kpis.pendingManualExpenses}`}
          />
          <CopilotKpiCard
            label="Riesgos activos"
            value={String(activeRisks.length)}
            hint={`Alertas totales: ${alerts.length}`}
          />
          <CopilotKpiCard
            label="Insights IA"
            value={String(insights.length)}
            hint="Señales accionables del motor financiero"
          />
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)]">
          <CopilotSectionTitle
            title="Proyección 30 días"
            subtitle="Evolución diaria de caja proyectada."
          />
          {chartSnapshots.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin proyección disponible.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex h-28 items-end gap-0.5">
                {chartSnapshots.map((snapshot) => {
                  const value =
                    currencyFilter === "USD"
                      ? snapshot.projectedCashUsd
                      : snapshot.projectedCashUyu;
                  const height = Math.max(6, Math.round((Math.abs(value) / chartMax) * 100));
                  const negative = value < 0;
                  return (
                    <div
                      key={snapshot.date}
                      title={`${snapshot.date}: ${formatTreasuryMoney(value, projectedCash.primary)}`}
                      className={`flex-1 rounded-t-md ${negative ? "bg-rose-400/80" : "bg-emerald-500/70"}`}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Barras diarias de saldo proyectado ({projectedCash.primary}).
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)]">
          <CopilotSectionTitle
            title="Obligaciones próximas"
            subtitle="Compromisos en los próximos 30 días."
          />
          {workspace.upcoming30.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin obligaciones próximas.</p>
          ) : (
            <ul className="space-y-1.5">
              {workspace.upcoming30.slice(0, 8).map((obligation) => (
                <li
                  key={obligation.id}
                  className="rounded-lg border border-[var(--copilot-border)] bg-white/60 px-2.5 py-1.5 text-xs"
                >
                  <p className="font-medium text-[var(--copilot-ink)]">{obligation.title}</p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    {obligation.dueDate} ·{" "}
                    {formatTreasuryMoney(
                      obligation.amountFinal ?? obligation.amountEstimated,
                      obligation.currencyCode
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)]">
          <CopilotSectionTitle title="Riesgos activos" subtitle="Alertas warning y critical." />
          {activeRisks.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin riesgos activos.</p>
          ) : (
            <ul className="space-y-1.5">
              {activeRisks.slice(0, 8).map((alert) => (
                <li
                  key={alert.id}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${severityClass(alert.severity)}`}
                >
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-xs opacity-90">{alert.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)]">
          <CopilotSectionTitle title="Insights IA" subtitle="Recomendaciones ejecutivas accionables." />
          {insights.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin insights para el filtro actual.</p>
          ) : (
            <ul className="space-y-1.5">
              {insights.slice(0, 6).map((insight) => (
                <li
                  key={insight.id}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${priorityClass(insight.priority)}`}
                >
                  <p className="font-medium text-[var(--copilot-ink)]">{insight.title}</p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">{insight.description}</p>
                  {insight.recommendation ? (
                    <p className="mt-1 text-xs text-[var(--copilot-ink)]">{insight.recommendation}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function TesoreriaDashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <section>
        <div className="mb-3 h-4 w-48 animate-pulse rounded-lg bg-[var(--copilot-border)]/60" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-white/50"
            />
          ))}
        </div>
      </section>
      <section className="grid gap-3 xl:grid-cols-2">
        <div className="h-44 animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-white/50" />
        <div className="h-44 animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-white/50" />
      </section>
    </div>
  );
}
