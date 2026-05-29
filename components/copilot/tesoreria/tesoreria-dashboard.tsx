"use client";

import { CopilotBadge, CopilotGhostButton, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import { formatDueWithTime, getDueTime } from "@/lib/treasury/treasury-obligation-actions";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
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
  if (workspace.loading && workspace.lastFetchedAt == null) {
    return <TesoreriaDashboardSkeleton />;
  }

  const cashPositionFailed = workspace.cashPositionFailed;
  const cashByCode = Object.fromEntries(
    workspace.cashPositions.map((p) => [p.currency, p])
  ) as Partial<Record<TreasuryCurrencyCode, CashPositionByCurrency>>;

  const overdueTotals = sumOutflowsByCurrency(workspace.overdue);
  const upcoming7Totals = sumOutflowsByCurrency(workspace.upcoming7);
  const upcoming30Totals = sumOutflowsByCurrency(workspace.upcoming30);

  // After commitments: skip calculation if cash position failed (avoid false negatives)
  const afterCommitments: Partial<Record<TreasuryCurrencyCode, number>> = {};
  if (!cashPositionFailed) {
    for (const cur of CURRENCIES) {
      const cash = cashByCode[cur]?.availableCash ?? 0;
      afterCommitments[cur] = cash - (overdueTotals[cur] ?? 0) - (upcoming30Totals[cur] ?? 0);
    }
  }

  // Top 5 most urgent: overdue first, then upcoming7 (deduped by id)
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
      title: `${n} pago${n > 1 ? "s" : ""} vencido${n > 1 ? "s" : ""}`,
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
          description: `La caja disponible no cubre los compromisos de 30 días. Diferencia: ${fmt(after, cur)}.`,
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
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
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
                  className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4"
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
                          <dd className="tabular-nums text-emerald-700">+{fmt(pos.collectedFromClients, cur)}</dd>
                        </div>
                      ) : null}
                      {pos.manualIncome > 0 ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--copilot-ink-muted)]">Ingresos manuales</dt>
                          <dd className="tabular-nums text-emerald-700">+{fmt(pos.manualIncome, cur)}</dd>
                        </div>
                      ) : null}
                      {pos.manualExpense > 0 ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--copilot-ink-muted)]">Egresos manuales</dt>
                          <dd className="tabular-nums text-rose-700">−{fmt(pos.manualExpense, cur)}</dd>
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
              { label: "Vencidos", totals: overdueTotals, textColor: "text-rose-700" },
              { label: "Próximos 7 días", totals: upcoming7Totals, textColor: "text-amber-700" },
              { label: "Próximos 30 días", totals: upcoming30Totals, textColor: "text-[var(--copilot-ink)]" },
            ] as const
          ).map(({ label, totals, textColor }) => (
            <div
              key={label}
              className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4"
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

      {/* ── Bloque 3: Caja después de compromisos ── */}
      <section>
        <CopilotSectionTitle
          title="Caja después de compromisos"
          subtitle="Disponible − vencidos − egresos 30 días programados."
        />
        {cashPositionFailed ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
            No se pudo calcular la caja después de compromisos sin datos de caja disponible.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {CURRENCIES.map((cur) => {
              const after = afterCommitments[cur] ?? 0;
              const cash = cashByCode[cur]?.availableCash ?? 0;
              const committed = (overdueTotals[cur] ?? 0) + (upcoming30Totals[cur] ?? 0);
              const negative = after < 0;
              return (
                <div
                  key={cur}
                  className={`rounded-xl border p-4 ${
                    negative
                      ? "border-rose-200 bg-rose-50/70"
                      : "border-[var(--copilot-border)] bg-white/70"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      negative ? "text-rose-700" : "text-[var(--copilot-ink-muted)]"
                    }`}
                  >
                    {cur}
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold tabular-nums ${
                      negative ? "text-rose-700" : "text-[var(--copilot-ink)]"
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

      {/* ── Bloque 4: Próximos pagos relevantes ── */}
      {topObligations.length > 0 ? (
        <section>
          <CopilotSectionTitle
            title="Próximos pagos"
            subtitle="Vencidos y obligaciones más urgentes de la semana."
            action={
              <CopilotGhostButton type="button" className="!py-1 !text-xs" onClick={onGoToPagos}>
                Ver todos →
              </CopilotGhostButton>
            }
          />
          <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-white/50">
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
                          {isOverdue ? "Vencido" : "Pendiente"}
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

      {/* ── Bloque 5: Acciones sugeridas (máx 3) ── */}
      {alerts.length > 0 ? (
        <section>
          <CopilotSectionTitle
            title="Acciones sugeridas"
            subtitle="Riesgos operativos que requieren atención."
          />
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  alert.severity === "critical"
                    ? "border-rose-200 bg-rose-50/80 text-rose-950"
                    : "border-amber-200 bg-amber-50/80 text-amber-950"
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
              className="h-28 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-white/50"
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
              className="h-20 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-white/50"
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
              className="h-24 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-white/50"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
