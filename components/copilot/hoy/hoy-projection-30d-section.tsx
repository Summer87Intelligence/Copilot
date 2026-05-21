"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { HoyProjection30dBlock, HoyTreasuryAlert } from "@/lib/copilot-today-business-pulse";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

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

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">{HOY_COPY.availableCashLabel}</span>
          <span className={moneyToneClass("neutral")}>
            {fmtCurrencyAmount(block.currentCash, currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">{HOY_COPY.scheduledPaymentsLabel}</span>
          {block.hasConfiguredPayments ? (
            <span className={moneyToneClass("warning")}>
              {fmtCurrencyAmount(block.scheduledPayments, currency)}
            </span>
          ) : (
            <span className="text-xs text-[var(--copilot-ink-muted)]">{HOY_COPY.treasuryNoOutflows}</span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <span className="font-medium text-[var(--copilot-ink)]">{HOY_COPY.safeCash30Label}</span>
          {block.hasConfiguredPayments ? (
            <span className={moneyToneClass(amountTone(block.safeCash30d))}>
              {fmtCurrencyAmount(block.safeCash30d, currency)}
            </span>
          ) : (
            <span className={moneyToneClass("neutral")}>
              {fmtCurrencyAmount(block.currentCash, currency)}
            </span>
          )}
        </div>
        {block.hasConfiguredPayments ? (
          <p className="text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">
            {HOY_COPY.safeCash30Helper}
          </p>
        ) : null}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">{HOY_COPY.pendingReceivablesLabel}</span>
          {block.pendingReceivables > 0 ? (
            <span className={moneyToneClass("warning")}>
              {fmtCurrencyAmount(block.pendingReceivables, currency)}
            </span>
          ) : (
            <span className="text-[var(--copilot-ink-muted)]">—</span>
          )}
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {HOY_COPY.pendingReceivablesHelper}
        </p>
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <span className="font-medium text-[var(--copilot-ink)]">{HOY_COPY.expectedCash30Label}</span>
          <span className={moneyToneClass(amountTone(block.expectedCash30d))}>
            {fmtCurrencyAmount(block.expectedCash30d, currency)}
          </span>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {HOY_COPY.expectedCash30Helper}
        </p>
      </div>
    </div>
  );
}

export function HoyProjection30dSection({
  blocks,
  alerts,
  configured,
}: {
  blocks: HoyProjection30dBlock[];
  alerts: HoyTreasuryAlert[];
  configured: boolean;
}) {
  if (blocks.length === 0) return null;

  return (
    <CopilotCard>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{HOY_COPY.projection30Title}</h2>
        <HoyScopeBadge label={HOY_COPY.scopeBadgeProjection} />
      </div>
      <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">{HOY_COPY.projection30Subtitle}</p>

      {!configured ? (
        <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/40 px-4 py-3 text-sm text-amber-950">
          <p>
            No hay egresos futuros configurados. Configuralos en Tesorería para proyectar caja segura.
          </p>
          <Link
            href="/copilot/tesoreria?section=obligations"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Ir a Tesorería
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <ProjectionCurrencyBlock key={block.currency} block={block} />
        ))}
      </div>

      {alerts.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {alerts.map((a) => (
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
