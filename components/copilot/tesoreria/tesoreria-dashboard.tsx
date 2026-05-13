"use client";

import { CopilotKpiCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import type { TesoreriaCurrencyFilter } from "@/components/copilot/tesoreria/tesoreria-control-bar";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import {
  buildProjectionTimeline,
  computeTreasuryAlerts,
  computeTreasuryDashboardKpis,
  formatTreasuryMoney,
} from "@/lib/treasury/treasury-dashboard";

type Props = {
  workspace: TreasuryWorkspace;
  currencyFilter: TesoreriaCurrencyFilter;
  asOfDate: string;
};

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

  const alerts = computeTreasuryAlerts({
    asOfDate,
    obligations: workspace.obligations,
    bankMovements: workspace.bankMovements,
    manualMovements: workspace.manualMovements,
    currencyFilter,
  });

  const projection = buildProjectionTimeline({
    asOfDate,
    manualMovements: workspace.manualMovements,
    bankMovements: workspace.bankMovements,
    obligations: workspace.obligations,
    currencyFilter,
  });

  return (
    <div className="space-y-6">
      <section>
        <CopilotSectionTitle
          title="Indicadores de tesorería"
          subtitle="Caja, banco Santander, obligaciones y conciliación desde APIs treasury."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <CopilotKpiCard
            label="Caja actual UYU"
            value={formatTreasuryMoney(kpis.cashByCurrency.UYU ?? 0, "UYU")}
            hint="Movimientos ledger caja"
          />
          <CopilotKpiCard
            label="Caja actual USD"
            value={formatTreasuryMoney(kpis.cashByCurrency.USD ?? 0, "USD")}
            hint="Movimientos ledger caja"
          />
          <CopilotKpiCard
            label="Santander UYU"
            value={formatTreasuryMoney(kpis.santanderByCurrency.UYU ?? 0, "UYU")}
            hint="Cuenta banco + extracto"
          />
          <CopilotKpiCard
            label="Santander USD"
            value={formatTreasuryMoney(kpis.santanderByCurrency.USD ?? 0, "USD")}
            hint="Cuenta banco + extracto"
          />
          <CopilotKpiCard
            label="Obligaciones 7 / 30 días"
            value={`${kpis.obligationsUpcoming7} / ${kpis.obligationsUpcoming30}`}
            hint="Próximas según API upcoming"
          />
          <CopilotKpiCard
            label="Vencidas / sin conciliar"
            value={`${kpis.obligationsOverdue} / ${kpis.unmatchedBankMovements}`}
            hint={`Egresos manuales pendientes: ${kpis.pendingManualExpenses}`}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-5 shadow-[var(--copilot-shadow)]">
          <CopilotSectionTitle
            title="Alertas inteligentes"
            subtitle="Motor treasury sobre datos reales."
          />
          {alerts.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin alertas para el filtro actual.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 8).map((alert) => (
                <li
                  key={`${alert.kind}-${alert.recordId}`}
                  className="rounded-xl border border-[var(--copilot-border)] bg-white/60 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-[var(--copilot-ink)]">{alert.message}</p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    {alert.severity} · {formatTreasuryMoney(alert.amount, alert.currencyCode)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-5 shadow-[var(--copilot-shadow)]">
          <CopilotSectionTitle title="Proyección de caja" subtitle="Horizontes 0/7/15/30/60 días." />
          {projection.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin proyección para el filtro actual.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    <th className="pb-2 pr-3">Horizonte</th>
                    <th className="pb-2 pr-3">Moneda</th>
                    <th className="pb-2 pr-3">Ingresos</th>
                    <th className="pb-2 pr-3">Egresos</th>
                    <th className="pb-2 pr-3">Saldo proyectado</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.map((point) => (
                    <tr
                      key={`${point.label}-${point.currencyCode}`}
                      className="border-t border-[var(--copilot-border)]"
                    >
                      <td className="py-2 pr-3 font-medium">{point.label}</td>
                      <td className="py-2 pr-3">{point.currencyCode}</td>
                      <td className="py-2 pr-3">
                        {formatTreasuryMoney(point.incomeExpected, point.currencyCode)}
                      </td>
                      <td className="py-2 pr-3">
                        {formatTreasuryMoney(point.outflowExpected, point.currencyCode)}
                      </td>
                      <td className="py-2 pr-3">
                        {formatTreasuryMoney(point.projectedBalance, point.currencyCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TesoreriaDashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section>
        <div className="mb-4 h-5 w-56 animate-pulse rounded-lg bg-[var(--copilot-border)]/60" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-white/50"
            />
          ))}
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-white/50" />
        <div className="h-64 animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-white/50" />
      </section>
    </div>
  );
}