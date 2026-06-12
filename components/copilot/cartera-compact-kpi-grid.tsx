"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { CarteraPendingDrawer } from "@/components/copilot/cartera-pending-drawer";
import {
  buildCurrencyIndex,
  type NormalizedCurrencyMetrics,
} from "@/lib/copilot-cartera-cards-source";
import { formatCarteraInteger, formatCarteraMoney } from "@/lib/copilot-cartera-format";
import { buildCurrentDebtSnapshot } from "@/lib/copilot-cartera-pending-debt-snapshot";
import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import { METRIC_LABEL } from "@/lib/copilot-financial-metrics-contract";
import type {
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import {
  copilotCurrencyClass,
  neutralFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";

type CompactVariant = "ventas" | "resumen" | "cobranza";

const CURRENCIES: ReconciliationCurrencyCode[] = ["UYU", "USD"];

function CompactCard({
  title,
  children,
  onClick,
  actionLabel,
}: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const interactive = Boolean(onClick);
  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`rounded-xl border px-3 py-2.5 shadow-sm ${neutralFinancialCardClass} ${
        interactive ? "cursor-pointer transition hover:border-[var(--copilot-accent)]/30 hover:shadow-md" : ""
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {title}
      </p>
      <div className="mt-1.5 space-y-1">{children}</div>
      {actionLabel ? (
        <p className="mt-2 text-[10px] font-semibold text-[var(--copilot-accent)]">{actionLabel}</p>
      ) : null}
    </article>
  );
}

function CurrencyLine({
  code,
  value,
  tone = "default",
}: {
  code: ReconciliationCurrencyCode;
  value: string;
  tone?: "default" | "danger" | "muted";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[var(--copilot-danger-text-strong)]"
      : tone === "muted"
        ? "text-[var(--copilot-ink-muted)]"
        : copilotCurrencyClass(code);
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className={`font-semibold ${copilotCurrencyClass(code)}`}>{code}</span>
      <span className={`font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

function metricFor(
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>,
  code: ReconciliationCurrencyCode
) {
  return index.get(code);
}

export function CarteraCompactKpiGrid({
  report,
  variant,
  periodRangeLabel,
  isPreSync = false,
}: {
  report: FinancialConsistencyReport;
  variant: CompactVariant;
  periodRangeLabel?: string;
  isPreSync?: boolean;
}) {
  const index = useMemo(() => buildCurrencyIndex(report.currencies), [report.currencies]);
  const [pendingDrawerCurrency, setPendingDrawerCurrency] =
    useState<ReconciliationCurrencyCode | null>(null);
  const pendingSnapshot = useMemo(
    () =>
      pendingDrawerCurrency
        ? buildCurrentDebtSnapshot(report, pendingDrawerCurrency)
        : null,
    [report, pendingDrawerCurrency]
  );
  const openPendingDrawer = useCallback((currency: ReconciliationCurrencyCode) => {
    setPendingDrawerCurrency(currency);
  }, []);
  const closePendingDrawer = useCallback(() => setPendingDrawerCurrency(null), []);

  if (variant === "ventas") {
    const cards: React.ReactNode[] = [];
    for (const code of CURRENCIES) {
      const m = metricFor(index, code);
      const issued = m?.issuedInPeriodNet ?? 0;
      cards.push(
        <CompactCard
          key={`ventas-${code}`}
          title={`${METRIC_LABEL.facturado_periodo} ${code}`}
        >
          <CurrencyLine
            code={code}
            value={issued > 0 ? formatCarteraMoney(code, issued, { fractionDigits: 0 }) : "—"}
          />
          {periodRangeLabel ? (
            <p className="text-[10px] text-[var(--copilot-ink-muted)]">{periodRangeLabel}</p>
          ) : null}
        </CompactCard>
      );
      const nc = m?.creditNoteAmount ?? 0;
      if (nc > 0) {
        cards.push(
          <CompactCard key={`nc-${code}`} title={`Notas crédito ${code}`}>
            <CurrencyLine code={code} value={formatCarteraMoney(code, nc, { fractionDigits: 0 })} tone="danger" />
          </CompactCard>
        );
      }
    }
    if (cards.length === 0) {
      return (
        <p className="text-xs text-[var(--copilot-ink-muted)]">Sin ventas en el período.</p>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{cards}</div>
    );
  }

  if (variant === "resumen") {
    return (
      <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CompactCard title={FINANCIAL_UX_COPY.kpiCollectedAppliedLabel}>
            {CURRENCIES.map((code) => {
              const m = metricFor(index, code);
              const v = m?.portfolioResolvedAmount ?? 0;
              return (
                <CurrencyLine
                  key={code}
                  code={code}
                  value={v > 0 ? formatCarteraMoney(code, v, { fractionDigits: 0 }) : "—"}
                />
              );
            })}
          </CompactCard>
          <CompactCard
            title="Total pendiente"
            onClick={() => {
              const uyu = metricFor(index, "UYU")?.pendingAtCutoff ?? 0;
              if (uyu > 0) openPendingDrawer("UYU");
              else if ((metricFor(index, "USD")?.pendingAtCutoff ?? 0) > 0) openPendingDrawer("USD");
            }}
            actionLabel="Ver facturas"
          >
            {CURRENCIES.map((code) => {
              const v = metricFor(index, code)?.pendingAtCutoff ?? 0;
              return (
                <CurrencyLine
                  key={code}
                  code={code}
                  value={v > 0 ? formatCarteraMoney(code, v, { fractionDigits: 0 }) : "—"}
                  tone={v > 0 ? "danger" : "muted"}
                />
              );
            })}
          </CompactCard>
          <CompactCard title="Pendiente del período">
            {CURRENCIES.map((code) => {
              const v = metricFor(index, code)?.totalPending ?? 0;
              return (
                <CurrencyLine
                  key={code}
                  code={code}
                  value={v > 0 ? formatCarteraMoney(code, v, { fractionDigits: 0 }) : "—"}
                />
              );
            })}
          </CompactCard>
          <CompactCard title="Cobranza efectiva">
            {CURRENCIES.map((code) => {
              const m = metricFor(index, code);
              const net = Math.max(0, (m?.issuedInPeriod ?? 0) - (m?.creditNoteAmount ?? 0));
              const ratio =
                net > 0 && m && m.collectedReceiptCount > 0
                  ? `${Math.min(999, Math.round((m.collectedInPeriod / net) * 1000) / 10).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`
                  : "—";
              return <CurrencyLine key={code} code={code} value={ratio} />;
            })}
            {isPreSync ? (
              <p className="text-[10px] text-[var(--copilot-ink-muted)]">Datos parciales pre-sync</p>
            ) : null}
          </CompactCard>
        </div>
        <CarteraPendingDrawer
          snapshot={pendingSnapshot}
          open={pendingDrawerCurrency !== null && pendingSnapshot !== null}
          onClose={closePendingDrawer}
        />
      </>
    );
  }

  // cobranza — fila baja: efectividad + clientes en riesgo
  const staleCount =
    (report.staleSummary?.warning ?? 0) +
    (report.staleSummary?.critical ?? 0) +
    (report.staleSummary?.never_synced ?? 0);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <CompactCard title="Cobranza efectiva">
        {CURRENCIES.map((code) => {
          const m = metricFor(index, code);
          const net = Math.max(0, (m?.issuedInPeriod ?? 0) - (m?.creditNoteAmount ?? 0));
          const ratio =
            net > 0 && m && m.collectedReceiptCount > 0
              ? `${Math.min(999, Math.round((m.collectedInPeriod / net) * 1000) / 10).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`
              : "—";
          return <CurrencyLine key={code} code={code} value={ratio} />;
        })}
      </CompactCard>
      <CompactCard title="Clientes en riesgo">
        <p className="text-lg font-bold tabular-nums text-[var(--copilot-ink)]">
          {formatCarteraInteger(staleCount)}
        </p>
        <p className="text-[10px] text-[var(--copilot-ink-muted)]">
          Con datos desactualizados o sin sync
        </p>
      </CompactCard>
      <CompactCard title="Explorador">
        <p className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
          La lista detallada vive en Clientes.
        </p>
        <Link
          href="/copilot/clientes"
          className="mt-1 inline-flex text-[11px] font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          Ver clientes con deuda →
        </Link>
      </CompactCard>
    </div>
  );
}
