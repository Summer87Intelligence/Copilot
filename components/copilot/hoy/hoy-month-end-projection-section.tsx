"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { HoyDrawer } from "@/components/copilot/hoy/hoy-drawer";
import { HoyMetricLabel } from "@/components/copilot/hoy/hoy-metric-label";
import { HoyScopeBadge } from "@/components/copilot/hoy/hoy-scope-badge";
import { moneyToneClass, type MoneyTone } from "@/components/copilot/hoy/hoy-money-value";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import {
  DEFAULT_MONTH_END_SCENARIO,
  MONTH_END_SCENARIO_LABEL,
  MONTH_END_SCENARIOS,
  monthEndRiskLevelLabel,
  type HoyMonthEndCurrencyBlock,
  type HoyMonthEndProjection,
  type HoyMonthEndProjectionBundle,
  type HoyMonthEndRiskFinding,
  type MonthEndRiskLevel,
  type MonthEndScenario,
} from "@/lib/copilot-hoy-month-end-projection";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";

function riskTone(risk: MonthEndRiskLevel): MoneyTone {
  if (risk === "critical") return "danger";
  if (risk === "attention") return "warning";
  return "positive";
}

function riskBadgeClass(risk: MonthEndRiskLevel): string {
  if (risk === "critical") return "bg-rose-100 text-rose-800";
  if (risk === "attention") return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-800";
}

function riskLabel(risk: MonthEndRiskLevel): string {
  if (risk === "critical") return HOY_COPY.monthEndRiskCritical;
  if (risk === "attention") return HOY_COPY.monthEndRiskAttention;
  return HOY_COPY.monthEndRiskStable;
}

function riskShortNote(risk: MonthEndRiskLevel): string {
  if (risk === "critical") return HOY_COPY.monthEndRiskNoteCritical;
  if (risk === "attention") return HOY_COPY.monthEndRiskNoteAttention;
  return HOY_COPY.monthEndRiskNoteStable;
}

function formatRiskFindingLine(finding: HoyMonthEndRiskFinding): string {
  return `${finding.currency} · ${finding.dateLabel} · ${monthEndRiskLevelLabel(finding.level)} — ${finding.reason}.`;
}

function worstProjectionRisk(blocks: readonly HoyMonthEndCurrencyBlock[]): MonthEndRiskLevel {
  let risk: MonthEndRiskLevel = "healthy";
  for (const block of blocks) {
    if (block.risk === "critical") return "critical";
    if (block.risk === "attention") risk = "attention";
  }
  return risk;
}

function ScenarioSelector({
  value,
  onChange,
}: {
  value: MonthEndScenario;
  onChange: (scenario: MonthEndScenario) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]/60 p-0.5"
      role="tablist"
      aria-label="Escenario de caja al cierre del mes"
    >
      {MONTH_END_SCENARIOS.map((scenario) => {
        const active = value === scenario;
        return (
          <button
            key={scenario}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(scenario)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              active
                ? "bg-[var(--copilot-card-bg)] text-[var(--copilot-ink)] shadow-sm"
                : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
            }`}
          >
            {MONTH_END_SCENARIO_LABEL[scenario]}
          </button>
        );
      })}
    </div>
  );
}

function CurrencyMonthEndBlock({
  block,
  collectionRatePct,
}: {
  block: HoyMonthEndCurrencyBlock;
  collectionRatePct: number;
}) {
  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${riskBadgeClass(block.risk)}`}
        >
          {riskLabel(block.risk)}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">{HOY_COPY.availableCashLabel}</span>
          <span className="tabular-nums text-[var(--copilot-ink)]">
            {fmtCurrencyAmount(block.availableCash, block.currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <HoyMetricLabel
            label={HOY_COPY.pendingReceivablesLabel}
            tip={HOY_COPY.pendingReceivablesTip}
          />
          <span className={`tabular-nums ${moneyToneClass(block.pendingReceivables > 0 ? "warning" : "neutral")}`}>
            {block.pendingReceivables > 0
              ? fmtCurrencyAmount(block.pendingReceivables, block.currency)
              : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Cobros estimados ({collectionRatePct}%)</span>
          <span className={`tabular-nums ${moneyToneClass(block.estimatedCollectionsMonth > 0 ? "positive" : "neutral")}`}>
            {block.estimatedCollectionsMonth > 0
              ? fmtCurrencyAmount(block.estimatedCollectionsMonth, block.currency)
              : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--copilot-ink-muted)]">Pagos hasta fin de mes</span>
          {block.hasConfiguredPayments ? (
            <span className={`tabular-nums ${moneyToneClass("warning")}`}>
              {fmtCurrencyAmount(block.scheduledOutflowsMonth, block.currency)}
            </span>
          ) : (
            <span className="text-xs text-[var(--copilot-ink-muted)]">{HOY_COPY.treasuryNoOutflows}</span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <span className="font-medium text-[var(--copilot-ink)]">Caja al cierre</span>
          <span className={`font-semibold tabular-nums ${moneyToneClass(riskTone(block.risk))}`}>
            {fmtCurrencyAmount(block.monthEndCash, block.currency)}
          </span>
        </div>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          {block.deltaVsToday >= 0 ? "▲" : "▼"}{" "}
          {fmtCurrencyAmount(Math.abs(block.deltaVsToday), block.currency)} vs caja hoy
        </p>
      </div>
    </div>
  );
}

function FridaysStrip({
  projection,
  onOpenDrawer,
}: {
  projection: HoyMonthEndProjection;
  onOpenDrawer: () => void;
}) {
  if (projection.fridayStrip.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <HoyMetricLabel
          label={HOY_COPY.monthEndFridaysTitle}
          tip={HOY_COPY.monthEndFridaysTip}
          className="text-sm font-semibold text-[var(--copilot-ink)]"
        />
        <button
          type="button"
          onClick={onOpenDrawer}
          className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          {HOY_COPY.monthEndDrawerCta}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {projection.fridayStrip.map((cell) => (
          <button
            key={cell.date}
            type="button"
            onClick={onOpenDrawer}
            className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]/50 px-3 py-2.5 text-left transition hover:border-[var(--copilot-accent)]/40"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {cell.label}
            </p>
            <div className="mt-1.5 space-y-2">
              {projection.currencyBlocks.map((block) => {
                const amount = cell.closingCash[block.currency];
                const risk = cell.riskByCurrency[block.currency];
                return (
                  <div key={block.currency}>
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-sm font-semibold tabular-nums ${moneyToneClass(riskTone(risk))}`}
                      >
                        {fmtCurrencyAmount(amount, block.currency)}
                      </p>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${riskBadgeClass(risk)}`}
                      >
                        {riskLabel(risk)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
                      {block.currency} · {riskShortNote(risk)}
                    </p>
                  </div>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthEndProjectionDrawer({
  projection,
  onClose,
}: {
  projection: HoyMonthEndProjection;
  onClose: () => void;
}) {
  return (
    <HoyDrawer
      title={HOY_COPY.monthEndDrawerTitle}
      onClose={onClose}
      footer={
        <Link
          href="/copilot/tesoreria"
          className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-3 py-2 text-sm font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-card-bg)]"
        >
          {HOY_COPY.monthEndTreasuryCta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">{projection.drawer.headline}</p>
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {projection.drawer.disclaimer}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        {HOY_COPY.monthEndDrawerScenariosNote}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        {HOY_COPY.monthEndDrawerLinearNote}
      </p>

      <div className="mt-4 space-y-3">
        {projection.drawer.lines.map((line) => (
          <div
            key={line.id}
            className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]/40 px-3 py-2.5"
          >
            <p className="text-xs font-semibold text-[var(--copilot-ink)]">{line.label}</p>
            <div className="mt-1.5 space-y-1 text-sm">
              {line.uyu != null && line.uyu !== 0 ? (
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--copilot-ink-muted)]">UYU</span>
                  <span className="tabular-nums font-medium">{fmtCurrencyAmount(line.uyu, "UYU")}</span>
                </div>
              ) : null}
              {line.usd != null && line.usd !== 0 ? (
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--copilot-ink-muted)]">USD</span>
                  <span className="tabular-nums font-medium">{fmtCurrencyAmount(line.usd, "USD")}</span>
                </div>
              ) : null}
            </div>
            {line.note ? (
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]">{line.note}</p>
            ) : null}
          </div>
        ))}
      </div>

      {projection.drawer.riskFindings.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {HOY_COPY.monthEndDrawerRisksTitle}
          </p>
          <ul className="mt-2 space-y-2 text-sm text-[var(--copilot-ink)]">
            {projection.drawer.riskFindings.map((finding) => (
              <li
                key={`${finding.currency}-${finding.date}-${finding.level}`}
                className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]/40 px-3 py-2"
              >
                <p className="font-medium">{formatRiskFindingLine(finding)}</p>
                <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                  Importe proyectado: {fmtCurrencyAmount(finding.projectedAmount, finding.currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {projection.drawer.causes.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Principales factores
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--copilot-ink)]">
            {projection.drawer.causes.map((cause) => (
              <li key={cause} className="flex gap-2">
                <span className="text-[var(--copilot-ink-muted)]">·</span>
                <span>{cause}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </HoyDrawer>
  );
}

type Props = {
  scenarioProjections: HoyMonthEndProjectionBundle;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
};

export function HoyMonthEndProjectionSection({
  scenarioProjections,
  drawerOpen,
  onOpenDrawer,
  onCloseDrawer,
}: Props) {
  const [scenario, setScenario] = useState<MonthEndScenario>(
    scenarioProjections.defaultScenario ?? DEFAULT_MONTH_END_SCENARIO
  );

  const projection = scenarioProjections.scenarios[scenario];
  if (!projection || projection.currencyBlocks.length === 0) return null;

  const overallRisk = worstProjectionRisk(projection.currencyBlocks);
  const subtitle = HOY_COPY.monthEndScenarioSubtitle[scenario];

  return (
    <>
      <CopilotCard className="w-full">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
                {HOY_COPY.monthEndProjectionTitle}
              </h2>
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                {HOY_COPY.monthEndMvpBadge}
              </span>
              <HoyScopeBadge label={`${HOY_COPY.scopeBadgeProjection} · Fin de mes`} />
            </div>
            <p className="mt-2">
              <ScenarioSelector value={scenario} onChange={setScenario} />
            </p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--copilot-ink)]">
              {subtitle}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
              Cierre de {projection.monthLabel}. {HOY_COPY.monthEndProjectionTip}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {projection.currencyBlocks.map((block) => (
                <span
                  key={block.currency}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${riskBadgeClass(block.risk)}`}
                >
                  {block.currency} — {riskLabel(block.risk)}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenDrawer}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            {HOY_COPY.monthEndDrawerCta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div
          className={`mt-3 grid grid-cols-1 gap-3 ${projection.currencyBlocks.length > 1 ? "md:grid-cols-2" : ""}`}
        >
          {projection.currencyBlocks.map((block) => (
            <CurrencyMonthEndBlock
              key={block.currency}
              block={block}
              collectionRatePct={projection.collectionRatePct}
            />
          ))}
        </div>

        <FridaysStrip projection={projection} onOpenDrawer={onOpenDrawer} />

        <p
          className={`mt-3 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            overallRisk === "critical"
              ? "bg-rose-50 text-rose-900"
              : overallRisk === "attention"
                ? "bg-amber-50 text-amber-900"
                : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {overallRisk === "critical"
            ? HOY_COPY.monthEndOverallCritical
            : overallRisk === "attention"
              ? HOY_COPY.monthEndOverallAttention
              : HOY_COPY.monthEndOverallStable}
        </p>
      </CopilotCard>

      {drawerOpen ? (
        <MonthEndProjectionDrawer projection={projection} onClose={onCloseDrawer} />
      ) : null}
    </>
  );
}
