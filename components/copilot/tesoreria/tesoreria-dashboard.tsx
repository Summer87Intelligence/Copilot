"use client";

import { CopilotBadge, CopilotGhostButton, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { PaymentBehaviorSummaryCard } from "@/components/copilot/payment-behavior/payment-behavior-summary-card";
import { usePaymentBehaviorProjection } from "@/hooks/use-payment-behavior-projection";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import { formatDueWithTime, getDueTime } from "@/lib/treasury/treasury-obligation-actions";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { buildTreasuryProjectedCashSnapshot } from "@/lib/treasury/treasury-projected-cash";
import type { PlannedCashObligation, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

type Props = {
  workspace: TreasuryWorkspace;
  onGoToPagos: () => void;
  asOfDate: string;
};

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

function sumOutflowsByCurrency(
  obligations: readonly PlannedCashObligation[]
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const obl of obligations) {
    if (obl.direction !== "outflow" || !obl.affectsCashflow) continue;
    const amt = obl.amountFinal ?? obl.amountEstimated;
    out[obl.currencyCode] = (out[obl.currencyCode] ?? 0) + amt;
  }
  return out;
}

function fmt(amount: number, currency: TreasuryCurrencyCode): string {
  return formatTreasuryMoney(amount, currency);
}

export function TesoreriaDashboard({ workspace, onGoToPagos, asOfDate }: Props) {
  const paymentBehavior = usePaymentBehaviorProjection();

  if (workspace.loading && workspace.lastFetchedAt == null) {
    return <TesoreriaDashboardSkeleton />;
  }

  const cashPositionFailed = workspace.cashPositionFailed;
  const cashByCode = Object.fromEntries(
    workspace.cashPositions.map((p) => [p.currency, p])
  ) as Partial<Record<TreasuryCurrencyCode, CashPositionByCurrency>>;

  const cashAvailableByCurrency = Object.fromEntries(
    CURRENCIES.map((cur) => [cur, cashByCode[cur]?.availableCash ?? 0])
  ) as Partial<Record<TreasuryCurrencyCode, number>>;

  const projectedCash = buildTreasuryProjectedCashSnapshot({
    obligations: workspace.obligations,
    overdue: workspace.overdue,
    upcoming30: workspace.upcoming30,
    cashByCurrency: cashAvailableByCurrency,
    asOfDate,
  });

  const overdueTotals = projectedCash.overdueTotals;
  const upcoming30Totals = projectedCash.upcoming30Totals;
  const afterCommitments = projectedCash.afterCommitments;
  const committedTotals = projectedCash.committedTotals;

  const upcoming7Totals = sumOutflowsByCurrency(workspace.upcoming7);
  const seen = new Set<string>();
  const topObligations: PlannedCashObligation[] = [];
  for (const obl of [
    ...workspace.overdue.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ...workspace.upcoming7.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  ]) {
    if (topObligations.length >= 5) break;
    if (seen.has(obl.id)) continue;
    seen.add(obl.id);
    topObligations.push(obl);
  }

  // Max 3 grouped action alerts
  type ResumenAlert = { id: string; severity: "critical" | "warning"; title: string; description: string };
  const alerts: ResumenAlert[] = [];

  if (workspace.overdue.length > 0) {
    const parts = CURRENCIES
      .map((cur) => (overdueTotals[cur] ? `${fmt(overdueTotals[cur]!, cur)}` : null))
      .filter(Boolean);
    const n = workspace.overdue.length;
    alerts.push({
      id: "overdue",
      severity: "critical",
      title: `${n} pago${n > 1 ? "s" : ""} atrasado${n > 1 ? "s" : ""}`,
      description: `Total: ${parts.join(" · ")}. Pagá o reprogramá los urgentes.`,
    });
  }

  if (!cashPositionFailed) {
    for (const cur of CURRENCIES) {
      if (alerts.length >= 3) break;
      const after = afterCommitments[cur] ?? 0;
      if (after < 0) {
        alerts.push({
          id: `low-cash-${cur}`,
          severity: "critical",
          title: `Caja insuficiente en ${cur}`,
          description: `La caja disponible no cubre los compromisos del mes actual. Diferencia: ${fmt(after, cur)}.`,
        });
      }
    }
  }

  if (workspace.upcoming7.length > 0 && alerts.length < 3) {
    const parts = CURRENCIES
      .map((cur) => (upcoming7Totals[cur] ? `${fmt(upcoming7Totals[cur]!, cur)}` : null))
      .filter(Boolean);
    const n = workspace.upcoming7.length;
    alerts.push({
      id: "upcoming7",
      severity: "warning",
      title: `${n} pago${n > 1 ? "s" : ""} esta semana`,
      description: parts.length > 0 ? `Total próximos 7 días: ${parts.join(" · ")}.` : "Revisá los pagos de la semana.",
    });
  }

  return (
    <div className="space-y-4">

      {/* ── Bloque 1: Caja disponible ── */}
      <section>
        <CopilotSectionTitle
          title="Caja disponible"
          subtitle="Saldo inicial + cobros de clientes + registros manuales."
        />
        {cashPositionFailed ? (
          <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] p-4 text-sm text-[var(--copilot-warning-text-strong)]">
            No se pudo cargar la posición de caja. Intentá recargar la página.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {CURRENCIES.map((cur) => {
              const pos = cashByCode[cur];
              const cash = pos?.availableCash ?? 0;
              return (
                <div
                  key={cur}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    {cur}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--copilot-ink)]">
                    {fmt(cash, cur)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                    {pos?.openingConfigured ? "Saldo inicial + movimientos" : "Solo movimientos manuales"}
                  </p>
                  {pos ? (
                    <dl className="mt-2 space-y-0.5 text-xs">
                      {pos.openingBalance > 0 ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--copilot-ink-muted)]">Saldo inicial</dt>
                          <dd className="tabular-nums text-[var(--copilot-ink)]">{fmt(pos.openingBalance, cur)}</dd>
                        </div>
                      ) : null}
                      {pos.collectedFromClients > 0 ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--copilot-ink-muted)]">Cobros de clientes</dt>
                          <dd className="tabular-nums text-[var(--copilot-success-text)]">+{fmt(pos.collectedFromClients, cur)}</dd>
                        </div>
                      ) : null}
                      {pos.manualIncome > 0 ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--copilot-ink-muted)]">Ingresos manuales</dt>
                          <dd className="tabular-nums text-[var(--copilot-success-text)]">+{fmt(pos.manualIncome, cur)}</dd>
                        </div>
                      ) : null}
                      {pos.manualExpense > 0 ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--copilot-ink-muted)]">Egresos manuales</dt>
                          <dd className="tabular-nums text-[var(--copilot-danger-text)]">−{fmt(pos.manualExpense, cur)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Bloque 2: Compromisos próximos ── */}
      <section>
        <CopilotSectionTitle
          title="Compromisos próximos"
          subtitle="Pagos programados por período y estado."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { label: "Atrasados", totals: overdueTotals, textColor: "text-[var(--copilot-danger-text)]" },
              { label: "Próximos 7 días", totals: upcoming7Totals, textColor: "text-[var(--copilot-warning-text)]" },
              { label: "Hasta fin de mes", totals: upcoming30Totals, textColor: "text-[var(--copilot-ink)]" },
            ] as const
          ).map(({ label, totals, textColor }) => (
            <div
              key={label}
              className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
            >
              <p className="text-xs font-semibold text-[var(--copilot-ink-muted)]">{label}</p>
              <dl className="mt-2 space-y-1 text-sm">
                {CURRENCIES.map((cur) => (
                  <div key={cur} className="flex justify-between gap-2">
                    <dt className="text-[var(--copilot-ink-muted)]">{cur}</dt>
                    <dd className={`font-semibold tabular-nums ${textColor}`}>
                      {fmt(totals[cur] ?? 0, cur)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bloque 3: Caja proyectada ── */}
      <section>
        <CopilotSectionTitle
          title="Caja proyectada"
          subtitle="Disponible menos compromisos del mes actual."
        />
        <p className="mb-3 text-xs text-[var(--copilot-ink-muted)]">
          Incluye ingresos y egresos ya cargados en caja, pagos programados y pagos generados por recurrentes.
          {projectedCash.recurringItemsInHorizon > 0
            ? ` ${projectedCash.recurringItemsInHorizon} pago${projectedCash.recurringItemsInHorizon === 1 ? "" : "s"} recurrente${projectedCash.recurringItemsInHorizon === 1 ? "" : "s"} en el horizonte.`
            : null}
        </p>
        {cashPositionFailed ? (
          <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] p-4 text-sm text-[var(--copilot-warning-text-strong)]">
            Configurá el saldo en Caja para ver la proyección.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {CURRENCIES.map((cur) => {
              const after = afterCommitments[cur] ?? 0;
              const cash = cashByCode[cur]?.availableCash ?? 0;
              const committed = committedTotals[cur] ?? 0;
              const negative = after < 0;
              return (
                <div
                  key={cur}
                  className={`rounded-xl border p-4 ${
                    negative
                      ? "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)]"
                      : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      negative ? "text-[var(--copilot-danger-text)]" : "text-[var(--copilot-ink-muted)]"
                    }`}
                  >
                    {cur}
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold tabular-nums ${
                      negative ? "text-[var(--copilot-danger-text)]" : "text-[var(--copilot-ink)]"
                    }`}
                  >
                    {fmt(after, cur)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                    {fmt(cash, cur)} disponible − {fmt(committed, cur)} compromisos
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Bloque 4: Cobros probables 30 días ── */}
      <section>
        <CopilotSectionTitle
          title="Cobros probables 30 días"
          subtitle="Estimación según historial de pago de cada cliente."
        />
        <PaymentBehaviorSummaryCard
          summaries={paymentBehavior.summaries}
          loading={paymentBehavior.loading}
        />
        {!paymentBehavior.loading && paymentBehavior.summaries.length > 0 && (
          <p className="mt-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
            Alta (90%): historial consistente · Media (65%): historial irregular · Baja (35%): datos insuficientes.
          </p>
        )}
      </section>

      {/* ── Bloque 5: Próximos pagos relevantes ── */}
      {topObligations.length > 0 ? (
        <section>
          <CopilotSectionTitle
            title="Próximos pagos"
            subtitle="Atrasados y obligaciones más urgentes de la semana."
            action={
              <CopilotGhostButton type="button" className="!py-1 !text-xs" onClick={onGoToPagos}>
                Ver todos →
              </CopilotGhostButton>
            }
          />
          <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--copilot-border)] text-xs text-[var(--copilot-ink-muted)]">
                  <th className="px-3 py-2 text-left font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 text-left font-medium">Vence</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--copilot-border)]">
                {topObligations.map((obl) => {
                  const effective = effectivePlannedObligationStatus(
                    obl.status,
                    obl.dueDate,
                    asOfDate
                  );
                  const isOverdue = effective === "overdue";
                  return (
                    <tr
                      key={obl.id}
                      className="cursor-pointer hover:bg-[rgba(44,40,37,0.02)]"
                      onClick={onGoToPagos}
                    >
                      <td className="px-3 py-2 font-medium text-[var(--copilot-ink)]">
                        {obl.title}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--copilot-ink)]">
                        {fmt(obl.amountFinal ?? obl.amountEstimated, obl.currencyCode)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--copilot-ink-muted)]">
                        {formatDueWithTime(obl.dueDate, getDueTime(obl))}
                      </td>
                      <td className="px-3 py-2">
                        <CopilotBadge tone={isOverdue ? "danger" : "warning"}>
                          {isOverdue ? "Atrasado" : "Pendiente"}
                        </CopilotBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── Bloque 6: Acciones sugeridas (máx 3) ── */}
      {alerts.length > 0 ? (
        <section>
          <CopilotSectionTitle
            title="Acciones sugeridas"
            subtitle="Acciones que requieren atención."
          />
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  alert.severity === "critical"
                    ? "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
                    : "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]"
                }`}
              >
                <p className="font-medium">{alert.title}</p>
                <p className="mt-0.5 text-xs opacity-90">{alert.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TesoreriaDashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <section>
        <div className="mb-3 h-4 w-48 animate-pulse rounded-lg bg-[var(--copilot-border)]/60" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50"
            />
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 h-4 w-48 animate-pulse rounded-lg bg-[var(--copilot-border)]/60" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50"
            />
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 h-4 w-48 animate-pulse rounded-lg bg-[var(--copilot-border)]/60" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
