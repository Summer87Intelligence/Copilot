"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { HoyProjection30dBlock, HoyTreasuryAlert } from "@/lib/copilot-today-business-pulse";
import {
  projectionCurrencySummaryLine,
  selectHoyProjectionUiAlerts,
} from "@/lib/copilot-hoy-projection-display";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

import { HoyMetricLabel } from "./hoy-metric-label";
import { HoyScopeBadge } from "./hoy-scope-badge";
import { type MoneyTone, moneyToneClass } from "./hoy-money-value";

function amountTone(value: number): MoneyTone {
  if (value > 0) return "positive";
  if (value < 0) return "danger";
  return "neutral";
}

function ProjectionCurrencyBlock({ block }: { block: HoyProjection30dBlock }) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const currency = block.currency;
  const summary = projectionCurrencySummaryLine(block);

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <HoyMetricLabel label={HOY_COPY.availableCashLabel} tip={HOY_COPY.cashCurrentTip} />
          <span className={moneyToneClass("neutral")}>
            {fmtCurrencyAmount(block.currentCash, currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <HoyMetricLabel label={HOY_COPY.scheduledPaymentsLabel} />
          {block.hasConfiguredPayments ? (
            <span className={moneyToneClass("warning")}>
              {fmtCurrencyAmount(block.scheduledPayments, currency)}
            </span>
          ) : (
            <span className="text-xs text-[var(--copilot-ink-muted)]">{HOY_COPY.treasuryNoOutflows}</span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <HoyMetricLabel
            label={HOY_COPY.safeCash30Label}
            tip={HOY_COPY.safeCash30Tip}
            className="font-medium text-[var(--copilot-ink)]"
          />
          {block.hasConfiguredPayments ? (
            <span className={`font-semibold tabular-nums ${moneyToneClass(amountTone(block.safeCash30d))}`}>
              {fmtCurrencyAmount(block.safeCash30d, currency)}
            </span>
          ) : (
            <span className={moneyToneClass("neutral")}>
              {fmtCurrencyAmount(block.currentCash, currency)}
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <HoyMetricLabel
            label={HOY_COPY.pendingReceivablesLabel}
            tip={HOY_COPY.pendingReceivablesTip}
          />
          {block.pendingReceivables > 0 ? (
            <span className={moneyToneClass("warning")}>
              {fmtCurrencyAmount(block.pendingReceivables, currency)}
            </span>
          ) : (
            <span className="text-[var(--copilot-ink-muted)]">—</span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <HoyMetricLabel
            label={HOY_COPY.expectedCash30Label}
            tip={HOY_COPY.expectedCash30Tip}
            className="font-medium text-[var(--copilot-ink)]"
          />
          <span className={`font-semibold tabular-nums ${moneyToneClass(amountTone(block.expectedCash30d))}`}>
            {fmtCurrencyAmount(block.expectedCash30d, currency)}
          </span>
        </div>
        {summary ? (
          <p className="text-[10px] leading-snug text-[var(--copilot-ink-muted)]">{summary}</p>
        ) : null}
      </div>
    </div>
  );
}

export function HoyProjection30dSection({
  blocks,
  alerts,
  configured,
  overdueCritical30,
}: {
  blocks: HoyProjection30dBlock[];
  alerts: HoyTreasuryAlert[];
  configured: boolean;
  overdueCritical30?: CarteraCurrencyTotals;
}) {
  if (blocks.length === 0) return null;

  const uiAlerts = selectHoyProjectionUiAlerts(
    alerts,
    blocks,
    overdueCritical30 ?? { UYU: 0, USD: 0 }
  );

  return (
    <CopilotCard>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{HOY_COPY.projection30Title}</h2>
        <HoyScopeBadge label={HOY_COPY.scopeBadgeProjection} />
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
        {HOY_COPY.projection30Tip}
      </p>

      {!configured ? (
        <div className="mt-4 rounded-lg border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.03)] px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
          <p>
            No hay pagos próximos cargados. Configuralos en Tesorería para proyectar mejor.
          </p>
          <Link
            href="/copilot/tesoreria?section=obligations"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Configurar pagos futuros
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <ProjectionCurrencyBlock key={block.currency} block={block} />
        ))}
      </div>

      {uiAlerts.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {uiAlerts.map((a) => (
            <li
              key={a.id}
              className={`rounded-lg px-3 py-2 text-xs leading-snug ${
                a.tone === "critical"
                  ? "bg-rose-50/80 text-rose-900"
                  : a.tone === "attention"
                    ? "bg-amber-50/60 text-amber-950"
                    : "bg-emerald-50/60 text-emerald-900"
              }`}
            >
              {a.message}
            </li>
          ))}
        </ul>
      ) : null}
    </CopilotCard>
  );
}
