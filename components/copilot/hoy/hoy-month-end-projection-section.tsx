"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, Info } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { CopilotButton, CopilotButtonLink } from "@/components/copilot/ui/copilot-button";
import {
  copilotCardCompactClass,
  copilotChipClass,
  metricValueClass,
  riskBadgeClass,
} from "@/components/copilot/ui/copilot-visual-system";
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

function riskLabel(risk: MonthEndRiskLevel): string {
  if (risk === "critical") return HOY_COPY.monthEndRiskCritical;
  if (risk === "attention") return HOY_COPY.monthEndRiskAttention;
  return HOY_COPY.monthEndRiskStable;
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
      className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-1"
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
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-[var(--copilot-accent)] text-white shadow-sm"
                : "text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-card-bg)] hover:text-[var(--copilot-ink)]"
            }`}
          >
            {MONTH_END_SCENARIO_LABEL[scenario]}
          </button>
        );
      })}
    </div>
  );
}

function ProjectionDetailRow({
  label,
  value,
  valueClass = "text-[var(--copilot-ink)]",
  labelNode,
}: {
  label?: string;
  value: ReactNode;
  valueClass?: string;
  labelNode?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      {labelNode ?? <span className="text-[var(--copilot-ink-muted)]">{label}</span>}
      <span className={`shrink-0 tabular-nums font-medium ${valueClass}`}>{value}</span>
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
    <div className={`flex flex-col ${copilotCardCompactClass}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
        <span className={`${copilotChipClass} uppercase tracking-wide ${riskBadgeClass(block.risk)}`}>
          {riskLabel(block.risk)}
        </span>
      </div>

      <div className="mt-4 flex flex-col items-center justify-center py-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
          Caja al cierre
        </p>
        <p className={`mt-1 text-[1.85rem] leading-none tracking-tight ${metricValueClass} ${moneyToneClass(riskTone(block.risk))}`}>
          {fmtCurrencyAmount(block.monthEndCash, block.currency)}
        </p>
        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
          {block.deltaVsToday >= 0 ? "▲" : "▼"}{" "}
          {fmtCurrencyAmount(Math.abs(block.deltaVsToday), block.currency)} vs caja hoy
        </p>
      </div>

      <div className="mt-auto space-y-0.5 border-t border-[var(--copilot-border)] pt-3 text-sm">
        <ProjectionDetailRow
          label={HOY_COPY.availableCashLabel}
          value={fmtCurrencyAmount(block.availableCash, block.currency)}
        />
        <ProjectionDetailRow
          labelNode={
            <HoyMetricLabel
              label={HOY_COPY.pendingReceivablesLabel}
              tip={HOY_COPY.pendingReceivablesTip}
            />
          }
          value={
            block.pendingReceivables > 0
              ? fmtCurrencyAmount(block.pendingReceivables, block.currency)
              : "—"
          }
          valueClass={moneyToneClass(block.pendingReceivables > 0 ? "warning" : "neutral")}
        />
        <ProjectionDetailRow
          label={`Cobros esperados del escenario (${collectionRatePct}%)`}
          value={
            block.estimatedCollectionsMonth > 0
              ? fmtCurrencyAmount(block.estimatedCollectionsMonth, block.currency)
              : "—"
          }
          valueClass={moneyToneClass(block.estimatedCollectionsMonth > 0 ? "positive" : "neutral")}
        />
        <ProjectionDetailRow
          label="Pagos hasta fin de mes"
          value={
            block.hasConfiguredPayments ? (
              fmtCurrencyAmount(block.scheduledOutflowsMonth, block.currency)
            ) : (
              <span className="text-xs font-normal text-[var(--copilot-ink-muted)]">
                {HOY_COPY.treasuryNoOutflows}
              </span>
            )
          }
          valueClass={block.hasConfiguredPayments ? moneyToneClass("warning") : ""}
        />
      </div>
    </div>
  );
}

function ExecutiveProjectionFlow({
  blocks,
  collectionRatePct,
}: {
  blocks: readonly HoyMonthEndCurrencyBlock[];
  collectionRatePct: number;
}) {
  if (blocks.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {blocks.map((block) => (
        <div
          key={block.currency}
          className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2 text-xs"
        >
          <p className="mb-1.5 font-semibold text-[var(--copilot-ink)]">{block.currency}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums text-[var(--copilot-ink-muted)]">
            <span>{fmtCurrencyAmount(block.availableCash, block.currency)}</span>
            <span className="text-[var(--copilot-subtle)]">+</span>
            <span className="text-[var(--copilot-badge-success-text)]">
              {fmtCurrencyAmount(block.estimatedCollectionsMonth, block.currency)}
            </span>
            <span className="text-[var(--copilot-subtle)]">−</span>
            <span className="text-[var(--copilot-badge-warning-text)]">
              {block.hasConfiguredPayments
                ? fmtCurrencyAmount(block.scheduledOutflowsMonth, block.currency)
                : "—"}
            </span>
            <span className="text-[var(--copilot-subtle)]">=</span>
            <span className={`font-semibold ${moneyToneClass(riskTone(block.risk))}`}>
              {fmtCurrencyAmount(block.monthEndCash, block.currency)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--copilot-ink-muted)]">
            Cobros al {collectionRatePct}% del pendiente · cierre de mes
          </p>
        </div>
      ))}
    </div>
  );
}

function FridaysTimeline({
  projection,
  onOpenDrawer,
}: {
  projection: HoyMonthEndProjection;
  onOpenDrawer: () => void;
}) {
  if (projection.fridayStrip.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <HoyMetricLabel
          label={HOY_COPY.monthEndFridaysTitle}
          tip={HOY_COPY.monthEndFridaysTip}
          className="text-xs font-semibold text-[var(--copilot-ink)]"
        />
        <CopilotButton type="button" variant="ghost" size="sm" onClick={onOpenDrawer}>
          {HOY_COPY.monthEndDrawerCta}
        </CopilotButton>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {projection.fridayStrip.map((cell, index) => (
          <div key={cell.date} className="flex min-w-[120px] flex-1 items-stretch">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="flex w-full flex-col rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 py-2 text-left transition hover:border-[var(--copilot-accent)]/40"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                {cell.label}
              </p>
              <div className="mt-1.5 space-y-1">
                {projection.currencyBlocks.map((block) => {
                  const amount = cell.closingCash[block.currency];
                  const risk = cell.riskByCurrency[block.currency];
                  return (
                    <div key={block.currency} className="flex items-baseline justify-between gap-1">
                      <span className="text-[10px] font-medium text-[var(--copilot-ink-muted)]">
                        {block.currency}
                      </span>
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${moneyToneClass(riskTone(risk))}`}
                      >
                        {fmtCurrencyAmount(amount, block.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </button>
            {index < projection.fridayStrip.length - 1 ? (
              <div className="flex w-4 shrink-0 items-center justify-center text-[var(--copilot-subtle)]">
                →
              </div>
            ) : null}
          </div>
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
        <CopilotButtonLink href="/copilot/tesoreria" variant="secondary" fullWidth>
          {HOY_COPY.monthEndTreasuryCta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </CopilotButtonLink>
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
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<MonthEndScenario>(
    scenarioProjections.defaultScenario ?? DEFAULT_MONTH_END_SCENARIO
  );

  const projection = scenarioProjections.scenarios[scenario];
  if (!projection || projection.currencyBlocks.length === 0) return null;

  const overallRisk = worstProjectionRisk(projection.currencyBlocks);
  const subtitle = HOY_COPY.monthEndScenarioSubtitle[scenario];

  return (
    <>
      <CopilotCard className="w-full overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-[var(--copilot-ink)]">
                  {HOY_COPY.monthEndProjectionTitle}
                </span>
                <span className="inline-flex items-center rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-badge-neutral-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
                  {HOY_COPY.monthEndMvpBadge}
                </span>
                <HoyScopeBadge label={`${HOY_COPY.scopeBadgeProjection} · Fin de mes`} />
              </span>
              <span className="mt-1.5 flex flex-wrap gap-2">
                {projection.currencyBlocks.map((block) => (
                  <span
                    key={block.currency}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${riskBadgeClass(block.risk)}`}
                  >
                    {block.currency} — {riskLabel(block.risk)}
                  </span>
                ))}
              </span>
              {!open ? (
                <>
                  <span className="mt-1 block text-xs text-[var(--copilot-ink-muted)]">
                    {subtitle} · Cierre de {projection.monthLabel}
                  </span>
                  <ExecutiveProjectionFlow
                    blocks={projection.currencyBlocks}
                    collectionRatePct={projection.collectionRatePct}
                  />
                </>
              ) : null}
            </span>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${open ? "rotate-180" : ""}`}
            />
          </button>
          <CopilotButton type="button" variant="ghost" size="sm" onClick={onOpenDrawer}>
            {HOY_COPY.monthEndDrawerCta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </CopilotButton>
        </div>

        {open ? (
          <div className="border-t border-[var(--copilot-border)] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
            <div className="mt-1">
              <ScenarioSelector value={scenario} onChange={setScenario} />
            </div>
            <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--copilot-ink)]">
              {subtitle}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
              Cierre de {projection.monthLabel}. {HOY_COPY.monthEndProjectionTip}
            </p>

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

            <ExecutiveProjectionFlow
              blocks={projection.currencyBlocks}
              collectionRatePct={projection.collectionRatePct}
            />

            <FridaysTimeline projection={projection} onOpenDrawer={onOpenDrawer} />

            <p className="mt-3 flex items-center gap-2 text-xs font-medium text-[var(--copilot-ink-muted)]">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  overallRisk === "critical"
                    ? "bg-[var(--copilot-status-critical-dot)]"
                    : overallRisk === "attention"
                      ? "bg-[var(--copilot-status-warn-dot)]"
                      : "bg-[var(--copilot-status-ok-dot)]"
                }`}
                aria-hidden
              />
              {overallRisk === "critical"
                ? HOY_COPY.monthEndOverallCritical
                : overallRisk === "attention"
                  ? HOY_COPY.monthEndOverallAttention
                  : HOY_COPY.monthEndOverallStable}
            </p>
          </div>
        ) : null}
      </CopilotCard>

      {drawerOpen ? (
        <MonthEndProjectionDrawer projection={projection} onClose={onCloseDrawer} />
      ) : null}
    </>
  );
}
