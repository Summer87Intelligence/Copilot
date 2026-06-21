"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CopilotBadge, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { usePaymentBehaviorProjection } from "@/hooks/use-payment-behavior-projection";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { formatDueWithTime, getDueTime } from "@/lib/treasury/treasury-obligation-actions";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { buildTreasuryProjectedCashSnapshot } from "@/lib/treasury/treasury-projected-cash";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { PlannedCashObligation, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

type CoverageStatus = "healthy" | "attention" | "critical";

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

function fmt(amount: number, currency: TreasuryCurrencyCode): string {
  return formatTreasuryMoney(amount, currency);
}

function coverageStatus(after: number, cash: number): CoverageStatus {
  if (after < 0) return "critical";
  if (cash > 0 && after / cash < 0.15) return "attention";
  return "healthy";
}

const STATUS_CARD: Record<CoverageStatus, string> = {
  critical:
    "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)]",
  attention:
    "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]",
  healthy:
    "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)]",
};

const STATUS_DOT: Record<CoverageStatus, string> = {
  critical: "bg-[var(--copilot-status-critical-dot)]",
  attention: "bg-[var(--copilot-status-warn-dot)]",
  healthy: "bg-[var(--copilot-status-ok-dot)]",
};

const STATUS_LABEL: Record<CoverageStatus, string> = {
  critical: "Rojo · insuficiente",
  attention: "Amarillo · ajustada",
  healthy: "Verde · cubierto",
};

function getMonthYm(ymd: string): string {
  return ymd.slice(0, 7);
}

function addMonths(ym: string, count: number): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7)) - 1 + count;
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type MonthBucket = {
  ym: string;
  label: string;
  outflows: Partial<Record<TreasuryCurrencyCode, number>>;
  count: number;
};

function buildMonthBuckets(
  obligations: readonly PlannedCashObligation[],
  todayYm: string
): MonthBucket[] {
  const yms = [todayYm, addMonths(todayYm, 1), addMonths(todayYm, 2)];
  const labels = ["Este mes", "Próximo mes", "En 2 meses"];
  const buckets: MonthBucket[] = yms.map((ym, i) => ({
    ym,
    label: labels[i]!,
    outflows: {},
    count: 0,
  }));
  const ymSet = new Map(buckets.map((b) => [b.ym, b]));

  for (const obl of obligations) {
    if (obl.direction !== "outflow" || !obl.affectsCashflow) continue;
    if (obl.status === "paid" || obl.status === "cancelled") continue;
    const bucket = ymSet.get(getMonthYm(obl.dueDate));
    if (!bucket) continue;
    const amt = obl.amountFinal ?? obl.amountEstimated;
    bucket.outflows[obl.currencyCode] = (bucket.outflows[obl.currencyCode] ?? 0) + amt;
    bucket.count++;
  }
  return buckets;
}

function UsdConsolidatedPositionBlock({
  cash,
  committed,
  after,
  fxRate,
}: {
  cash: number;
  committed: number;
  after: number;
  fxRate: number;
}) {
  const status = coverageStatus(after, cash);
  return (
    <div className={`rounded-xl border p-4 ${STATUS_CARD[status]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          USD estimado
        </p>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
          <span className="text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            {STATUS_LABEL[status]}
          </span>
        </span>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--copilot-ink-muted)]">Caja disponible</dt>
          <dd className="tabular-nums font-medium text-[var(--copilot-ink)]">{formatUsdEquivalent(cash)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--copilot-ink-muted)]">Compromisos 30 días</dt>
          <dd className="tabular-nums font-medium text-[var(--copilot-danger-text)]">
            {committed > 0 ? `− ${formatUsdEquivalent(committed)}` : formatUsdEquivalent(0)}
          </dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <dt className="font-medium text-[var(--copilot-ink)]">Resultado</dt>
          <dd className={`tabular-nums font-bold ${after < 0 ? "text-[var(--copilot-danger-text-strong)]" : "text-[var(--copilot-ink)]"}`}>
            {formatUsdEquivalent(after)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] text-[var(--copilot-ink-muted)]">
        TC {fxRate} · Resumen convertido a USD estimado.
      </p>
    </div>
  );
}

function UsdConsolidatedCoverageBlock({
  cash,
  receivables,
  committed,
  fxRate,
}: {
  cash: number;
  receivables: number;
  committed: number;
  fxRate: number;
}) {
  const expected = cash + receivables - committed;
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        USD estimado · TC {fxRate}
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--copilot-ink-muted)]">Caja disponible</dt>
          <dd className="tabular-nums text-[var(--copilot-ink)]">{formatUsdEquivalent(cash)}</dd>
        </div>
        {receivables > 0 ? (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Cobros previstos</dt>
            <dd className="tabular-nums text-[var(--copilot-success-text)]">+ {formatUsdEquivalent(receivables)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--copilot-ink-muted)]">Compromisos 30 días</dt>
          <dd className="tabular-nums text-[var(--copilot-danger-text)]">
            {committed > 0 ? `− ${formatUsdEquivalent(committed)}` : formatUsdEquivalent(0)}
          </dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <dt className="font-medium text-[var(--copilot-ink)]">Resultado esperado</dt>
          <dd className={`tabular-nums font-bold ${expected < 0 ? "text-[var(--copilot-danger-text-strong)]" : "text-[var(--copilot-ink)]"}`}>
            {formatUsdEquivalent(expected)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
        Detalle en moneda original. Resumen convertido a USD estimado.
      </p>
    </div>
  );
}

export function TreasuryExecutiveForecastPanel({
  workspace,
  asOfDate,
}: {
  workspace: TreasuryWorkspace;
  asOfDate: string;
}) {
  const paymentBehavior = usePaymentBehaviorProjection();
  const { mode, fxRate } = useDisplayCurrency();

  if (workspace.loading && workspace.lastFetchedAt == null) {
    return <TreasuryExecutiveSkeleton />;
  }

  const cashByCode = Object.fromEntries(
    workspace.cashPositions.map((p) => [p.currency, p])
  ) as Partial<Record<TreasuryCurrencyCode, CashPositionByCurrency>>;

  const cashAvailableByCurrency = Object.fromEntries(
    CURRENCIES.map((cur) => [cur, cashByCode[cur]?.availableCash ?? 0])
  ) as Partial<Record<TreasuryCurrencyCode, number>>;

  const projected = buildTreasuryProjectedCashSnapshot({
    obligations: workspace.obligations,
    overdue: workspace.overdue,
    upcoming30: workspace.upcoming30,
    cashByCurrency: cashAvailableByCurrency,
    asOfDate,
  });

  // Top 5: overdue first, then upcoming7, then upcoming30 — deduped
  const seen = new Set<string>();
  const topObligations: PlannedCashObligation[] = [];
  const candidates = [
    ...workspace.overdue.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ...workspace.upcoming7.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ...workspace.upcoming30.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  ];
  for (const obl of candidates) {
    if (topObligations.length >= 5) break;
    if (seen.has(obl.id)) continue;
    if (obl.direction !== "outflow" || !obl.affectsCashflow) continue;
    if (obl.status === "paid" || obl.status === "cancelled") continue;
    seen.add(obl.id);
    topObligations.push(obl);
  }

  // Estimated receivables from payment behavior (weighted 30d expected)
  const receivablesByCurrency: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const s of paymentBehavior.summaries) {
    const cur = s.currency as TreasuryCurrencyCode;
    receivablesByCurrency[cur] = (receivablesByCurrency[cur] ?? 0) + s.weightedExpected30d;
  }

  const isUsd = mode === "usd_equivalent";
  const cashUYU = cashAvailableByCurrency["UYU"] ?? 0;
  const cashUSD = cashAvailableByCurrency["USD"] ?? 0;
  const committedUYU = projected.committedTotals["UYU"] ?? 0;
  const committedUSD = projected.committedTotals["USD"] ?? 0;
  const afterUYU = projected.afterCommitments["UYU"] ?? 0;
  const afterUSD = projected.afterCommitments["USD"] ?? 0;
  const receivablesUYU = receivablesByCurrency["UYU"] ?? 0;
  const receivablesUSD = receivablesByCurrency["USD"] ?? 0;
  const usdConv = (uyu: number, usd: number) =>
    convertToUsdEquivalent({ uyu, usd }, fxRate);

  const todayYm = asOfDate.slice(0, 7);
  const monthBuckets = buildMonthBuckets(workspace.upcoming30, todayYm);
  const hasMonthData = monthBuckets.some((b) => b.count > 0);

  return (
    <div className="space-y-6">
      {/* ── FASE 1+4: Semáforo ejecutivo por moneda ── */}
      <section>
        <CopilotSectionTitle
          title="Posición de caja — 30 días"
          subtitle="Caja disponible menos compromisos programados."
        />
        {isUsd ? (
          <UsdConsolidatedPositionBlock
            cash={usdConv(cashUYU, cashUSD)}
            committed={usdConv(committedUYU, committedUSD)}
            after={usdConv(afterUYU, afterUSD)}
            fxRate={fxRate}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {CURRENCIES.map((cur) => {
              const cash = cashAvailableByCurrency[cur] ?? 0;
              const committed = projected.committedTotals[cur] ?? 0;
              const after = projected.afterCommitments[cur] ?? 0;
              const status = coverageStatus(after, cash);
              const nextDue = topObligations.find((o) => o.currencyCode === cur);
              const horizonCount =
                workspace.upcoming30.filter(
                  (o) =>
                    o.currencyCode === cur &&
                    o.direction === "outflow" &&
                    o.affectsCashflow &&
                    o.status !== "paid" &&
                    o.status !== "cancelled"
                ).length +
                workspace.overdue.filter(
                  (o) => o.currencyCode === cur && o.direction === "outflow" && o.affectsCashflow
                ).length;

              return (
                <div key={cur} className={`rounded-xl border p-4 ${STATUS_CARD[status]}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      {cur}
                    </p>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
                        aria-hidden
                      />
                      <span className="text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
                        {STATUS_LABEL[status]}
                      </span>
                    </span>
                  </div>

                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--copilot-ink-muted)]">Caja disponible</dt>
                      <dd className="tabular-nums font-medium text-[var(--copilot-ink)]">
                        {fmt(cash, cur)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--copilot-ink-muted)]">Compromisos 30 días</dt>
                      <dd className="tabular-nums font-medium text-[var(--copilot-danger-text)]">
                        {committed > 0 ? `− ${fmt(committed, cur)}` : fmt(0, cur)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
                      <dt className="font-medium text-[var(--copilot-ink)]">Resultado</dt>
                      <dd
                        className={`tabular-nums font-bold ${
                          after < 0
                            ? "text-[var(--copilot-danger-text-strong)]"
                            : "text-[var(--copilot-ink)]"
                        }`}
                      >
                        {fmt(after, cur)}
                      </dd>
                    </div>
                  </dl>

                  {horizonCount > 0 || nextDue ? (
                    <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
                      {horizonCount > 0
                        ? `${horizonCount} pago${horizonCount === 1 ? "" : "s"} en horizonte`
                        : ""}
                      {nextDue ? ` · Próx: ${nextDue.dueDate}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── FASE 2: Próximos vencimientos (top 5) ── */}
      {topObligations.length > 0 ? (
        <section>
          <CopilotSectionTitle
            title="Próximos vencimientos"
            subtitle="Atrasados y más urgentes del horizonte."
            action={
              <Link
                href="/copilot/tesoreria?section=programados"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
              >
                Ver todos
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          />
          <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50">
            <table
              className="w-full text-sm"
              aria-label="Próximos vencimientos"
            >
              <thead>
                <tr className="border-b border-[var(--copilot-border)] text-xs text-[var(--copilot-ink-muted)]">
                  <th className="px-3 py-2 text-left font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                    Vence
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--copilot-border)]">
                {topObligations.map((obl) => {
                  const eff = effectivePlannedObligationStatus(
                    obl.status,
                    obl.dueDate,
                    asOfDate
                  );
                  const isOverdue = eff === "overdue";
                  return (
                    <tr key={obl.id} className="hover:bg-[rgba(44,40,37,0.02)]">
                      <td className="px-3 py-2 font-medium text-[var(--copilot-ink)]">
                        {obl.title}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--copilot-ink)]">
                        {fmt(obl.amountFinal ?? obl.amountEstimated, obl.currencyCode)}
                      </td>
                      <td className="hidden px-3 py-2 tabular-nums text-[var(--copilot-ink-muted)] sm:table-cell">
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
          {isUsd ? (
            <p className="mt-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
              Detalle en moneda original. Resumen convertido a USD estimado.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── FASE 3: Cobertura esperada (caja + cobros - compromisos) ── */}
      <section>
        <CopilotSectionTitle
          title="Saldo proyectado"
          subtitle="Caja disponible + cobros previstos − compromisos 30 días."
        />
        {isUsd ? (
          <UsdConsolidatedCoverageBlock
            cash={usdConv(cashUYU, cashUSD)}
            receivables={usdConv(receivablesUYU, receivablesUSD)}
            committed={usdConv(committedUYU, committedUSD)}
            fxRate={fxRate}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {CURRENCIES.map((cur) => {
              const cash = cashAvailableByCurrency[cur] ?? 0;
              const committed = projected.committedTotals[cur] ?? 0;
              const receivables = receivablesByCurrency[cur] ?? 0;
              const expected = cash + receivables - committed;

              return (
                <div
                  key={cur}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    {cur}
                  </p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--copilot-ink-muted)]">Caja disponible</dt>
                      <dd className="tabular-nums text-[var(--copilot-ink)]">{fmt(cash, cur)}</dd>
                    </div>
                    {receivables > 0 ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--copilot-ink-muted)]">Cobros previstos</dt>
                        <dd className="tabular-nums text-[var(--copilot-success-text)]">
                          + {fmt(receivables, cur)}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--copilot-ink-muted)]">Compromisos 30 días</dt>
                      <dd className="tabular-nums text-[var(--copilot-danger-text)]">
                        {committed > 0 ? `− ${fmt(committed, cur)}` : fmt(0, cur)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
                      <dt className="font-medium text-[var(--copilot-ink)]">Resultado esperado</dt>
                      <dd
                        className={`tabular-nums font-bold ${
                          expected < 0
                            ? "text-[var(--copilot-danger-text-strong)]"
                            : "text-[var(--copilot-ink)]"
                        }`}
                      >
                        {fmt(expected, cur)}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
        {!paymentBehavior.loading && paymentBehavior.summaries.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
            Sin historial de cobros. La cobertura esperada coincide con el resultado conservador.
          </p>
        ) : null}
      </section>

      {/* ── FASE 7: Compromisos por mes (horizonte 90 días) ── */}
      {hasMonthData ? (
        <section>
          <CopilotSectionTitle
            title="Compromisos por mes"
            subtitle="Egresos programados en el horizonte de 90 días."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {monthBuckets.map((bucket) => (
              <div
                key={bucket.ym}
                className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
              >
                <p className="text-xs font-semibold text-[var(--copilot-ink-muted)]">
                  {bucket.label}
                </p>
                {bucket.count === 0 ? (
                  <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
                    Sin compromisos
                  </p>
                ) : (
                  <dl className="mt-2 space-y-1 text-sm">
                    {isUsd ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--copilot-ink-muted)]">USD estimado</dt>
                        <dd className="tabular-nums font-semibold text-[var(--copilot-ink)]">
                          {formatUsdEquivalent(usdConv(bucket.outflows["UYU"] ?? 0, bucket.outflows["USD"] ?? 0))}
                        </dd>
                      </div>
                    ) : (
                      CURRENCIES.map((cur) =>
                        bucket.outflows[cur] != null ? (
                          <div key={cur} className="flex justify-between gap-2">
                            <dt className="text-[var(--copilot-ink-muted)]">{cur}</dt>
                            <dd className="tabular-nums font-semibold text-[var(--copilot-ink)]">
                              {fmt(bucket.outflows[cur]!, cur)}
                            </dd>
                          </div>
                        ) : null
                      )
                    )}
                    <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                      {bucket.count} pago{bucket.count === 1 ? "" : "s"}
                    </p>
                  </dl>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TreasuryExecutiveSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section>
        <div className="mb-3 h-4 w-48 animate-pulse rounded-lg bg-[var(--copilot-border)]/60" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
