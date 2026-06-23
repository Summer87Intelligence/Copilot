"use client";

import type { PaymentProjectionSummary } from "@/lib/payment-behavior/payment-behavior-engine";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

function fmt(amount: number, currency: string): string {
  return formatTreasuryMoney(amount, currency as TreasuryCurrencyCode);
}

function ConfidenceBar({
  high,
  medium,
  low,
  total,
}: {
  high: number;
  medium: number;
  low: number;
  total: number;
}) {
  if (total <= 0) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div className="mt-2 flex w-full overflow-hidden rounded-full" style={{ height: 6 }}>
      <div
        className="bg-[var(--copilot-status-ok-dot)]"
        style={{ width: `${pct(high)}%` }}
        title={`Alta confianza: ${pct(high)}%`}
      />
      <div
        className="bg-[var(--copilot-status-warn-dot)]"
        style={{ width: `${pct(medium)}%` }}
        title={`Media confianza: ${pct(medium)}%`}
      />
      <div
        className="bg-[var(--copilot-subtle)]"
        style={{ width: `${pct(low + (total - high - medium - low))}%` }}
        title={`Baja / sin datos: ${pct(low)}%`}
      />
    </div>
  );
}

type Props = {
  summaries: PaymentProjectionSummary[];
  loading?: boolean;
};

export function PaymentBehaviorSummaryCard({ summaries, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50"
          />
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <p className="text-xs text-[var(--copilot-ink-muted)]">
        Sin facturas pendientes para proyectar.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {summaries.map((s) => (
        <div
          key={s.currency}
          className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {s.currency}
          </p>
          <p
            className="mt-1 text-2xl font-bold tabular-nums text-[var(--copilot-ink)]"
            title="Monto ponderado por confianza de pago"
          >
            {fmt(s.weightedExpected30d, s.currency)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            Deuda actual: {fmt(s.totalExpected30d, s.currency)}
          </p>
          <ConfidenceBar
            high={s.highConfidence30d}
            medium={s.mediumConfidence30d}
            low={s.lowConfidence30d}
            total={s.totalExpected30d}
          />
          <dl className="mt-2 space-y-0.5 text-xs">
            {s.highConfidence30d > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-success-text)]">Alta confianza</dt>
                <dd className="tabular-nums text-[var(--copilot-success-text)]">{fmt(s.highConfidence30d, s.currency)}</dd>
              </div>
            )}
            {s.mediumConfidence30d > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-warning-text)]">Media confianza</dt>
                <dd className="tabular-nums text-[var(--copilot-warning-text)]">{fmt(s.mediumConfidence30d, s.currency)}</dd>
              </div>
            )}
            {s.lowConfidence30d > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Baja confianza</dt>
                <dd className="tabular-nums text-[var(--copilot-ink-muted)]">
                  {fmt(s.lowConfidence30d, s.currency)}
                </dd>
              </div>
            )}
            {s.over30Days > 0 && (
              <div className="flex justify-between gap-2 border-t border-[var(--copilot-border)] pt-1">
                <dt className="text-[var(--copilot-ink-muted)]">+30 días</dt>
                <dd className="tabular-nums text-[var(--copilot-ink-muted)]">
                  {fmt(s.over30Days, s.currency)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      ))}
    </div>
  );
}

/** Compact version: single line per currency — for use in Finanzas / Hoy. */
export function PaymentBehaviorCompactLine({
  summaries,
  loading,
}: {
  summaries: PaymentProjectionSummary[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-4 w-24 animate-pulse rounded bg-[var(--copilot-border)]/60" />
        ))}
      </div>
    );
  }
  if (summaries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {summaries.map((s) => (
        <span key={s.currency} className="text-xs text-[var(--copilot-ink-muted)]">
          <span className="font-medium text-[var(--copilot-ink)]">
            {fmt(s.weightedExpected30d, s.currency)}
          </span>{" "}
          cobros probables
        </span>
      ))}
    </div>
  );
}
