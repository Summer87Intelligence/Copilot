"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { CarteraPendingDrawer } from "@/components/copilot/cartera-pending-drawer";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import {
  CarteraKpiExplainDrawer,
  type CarteraKpiBreakdownRow,
  type CarteraKpiExplain,
} from "@/components/copilot/cartera-kpi-explain-drawer";
import {
  buildCurrencyIndex,
  type NormalizedCurrencyMetrics,
} from "@/lib/copilot-cartera-cards-source";
import { formatCarteraInteger, formatCarteraMoney } from "@/lib/copilot-cartera-format";
import {
  daysOverdueFromDate,
  formatCopilotDate,
  formatOverdueDaysLabel,
} from "@/lib/copilot-format";
import { buildCurrentDebtSnapshot } from "@/lib/copilot-cartera-pending-debt-snapshot";
import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import { METRIC_LABEL } from "@/lib/copilot-financial-metrics-contract";
import type {
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import { copilotCurrencyClass } from "@/components/copilot/ui/copilot-visual-system";
import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";

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
  return (
    <CopilotKpiCard
      size="compact"
      eyebrow={title}
      onClick={onClick}
      ariaLabel={onClick ? title : undefined}
      value={<div className="space-y-1">{children}</div>}
      footer={
        actionLabel ? (
          <p className="text-[10px] font-semibold text-[var(--copilot-accent)]">{actionLabel}</p>
        ) : undefined
      }
    />
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

type ExplainKind =
  | "facturado"
  | "credit_note"
  | "cobrado_aplicado"
  | "pendiente_periodo"
  | "cobranza_efectiva"
  | "clientes_en_riesgo";

function topClientRowsForCurrency(
  report: FinancialConsistencyReport,
  currency: ReconciliationCurrencyCode
): { rows: CarteraKpiBreakdownRow[]; clientCount: number } {
  const filtered = report.staleClients
    .map((c) => ({ c, amount: c.pendingByCurrency[currency] ?? 0 }))
    .filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount);
  // Devolvemos el set completo: el drawer trunca a top N y expone "Ver todos los clientes".
  const rows: CarteraKpiBreakdownRow[] = filtered.map(({ c, amount }) => ({
    kind: "client",
    label: c.companyName ?? c.companyId,
    secondary: `${c.invoiceCount} factura${c.invoiceCount === 1 ? "" : "s"}`,
    amount,
    state: c.dominantAgingRange,
    href: `/copilot/clientes/${encodeURIComponent(c.companyId)}`,
  }));
  return { rows, clientCount: filtered.length };
}

function topInvoiceRowsForCurrency(
  report: FinancialConsistencyReport,
  currency: ReconciliationCurrencyCode
): { rows: CarteraKpiBreakdownRow[]; invoiceCount: number; clientCount: number } {
  type Entry = {
    invoiceId: string;
    invoiceNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    balance: number;
    agingRange: string | null;
    companyName: string | null;
    companyId: string;
  };
  const entries: Entry[] = [];
  for (const c of report.staleClients) {
    const lines = c.pendingInvoices ?? [];
    for (const line of lines) {
      if (line.currencyCode !== currency) continue;
      if (!(line.balance > 0)) continue;
      entries.push({
        invoiceId: line.invoiceId,
        invoiceNumber: line.invoiceNumber,
        issueDate: line.issueDate,
        dueDate: line.dueDate,
        balance: line.balance,
        agingRange: line.agingRange,
        companyName: c.companyName,
        companyId: c.companyId,
      });
    }
  }
  entries.sort((a, b) => b.balance - a.balance);
  const clientIds = new Set(entries.map((e) => e.companyId));
  // Devolvemos el set completo: el drawer trunca a top N y expone "Ver todos".
  const rows: CarteraKpiBreakdownRow[] = entries.map((e) => ({
    kind: "invoice",
    label: e.companyName ?? e.companyId,
    secondary: e.invoiceNumber ?? "Sin número",
    amount: e.balance,
    date: e.issueDate ? formatCopilotDate(e.issueDate, "compact") : null,
    state: formatOverdueDaysLabel(daysOverdueFromDate(e.dueDate ?? e.issueDate)),
    href: `/copilot/clientes/${encodeURIComponent(e.companyId)}`,
  }));
  return { rows, invoiceCount: entries.length, clientCount: clientIds.size };
}

function buildExplain(
  kind: ExplainKind,
  currency: ReconciliationCurrencyCode,
  report: FinancialConsistencyReport,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>,
  periodLabel: string | null
): CarteraKpiExplain {
  const m = index.get(currency);
  switch (kind) {
    case "facturado": {
      const total = m?.issuedInPeriodNet ?? 0;
      const { rows, clientCount } = topClientRowsForCurrency(report, currency);
      return {
        title: METRIC_LABEL.facturado_periodo,
        currency,
        periodLabel,
        formula:
          "Σ facturas emitidas en el período (no anuladas) − Σ notas crédito del período.",
        notes: [
          "No mezcla UYU con USD.",
          "Excluye facturas anuladas.",
          "El detalle muestra clientes con saldo pendiente; la lista completa vive en Clientes.",
        ],
        total,
        invoiceCount: m?.pendingInvoiceCount ?? null,
        clientCount,
        rows,
        moreHref: "/copilot/clientes",
        moreLabel: "Abrir en Clientes",
      };
    }
    case "credit_note": {
      const total = m?.creditNoteAmount ?? 0;
      const ncLines = (report.periodCreditNotes ?? [])
        .filter((line) => line.currencyCode === currency)
        .sort((a, b) => b.amount - a.amount);
      // Pasamos el set completo: el drawer maneja top inicial + toggle inline.
      const rows: CarteraKpiBreakdownRow[] = ncLines.map((line) => ({
        kind: "credit_note",
        label: line.companyName ?? line.companyId ?? "—",
        secondary: line.voucherLabel,
        amount: line.amount,
        date: line.issueDate ? formatCopilotDate(line.issueDate, "compact") : null,
        state: line.status,
        associatedInvoice: line.associatedInvoiceLabel,
        href: line.companyId
          ? `/copilot/clientes/${encodeURIComponent(line.companyId)}`
          : null,
      }));
      return {
        title: `Notas crédito ${currency}`,
        currency,
        periodLabel,
        formula: "Σ notas crédito emitidas dentro del período (cfe_tipo NC).",
        notes: [
          "Reducen el facturado neto del período.",
          "No netean saldos vivos al cliente por sí solas.",
          "Factura asociada solo si Zeta la expone en metadata.",
        ],
        total,
        invoiceCount: m?.creditNoteCount ?? null,
        clientCount: new Set(ncLines.map((l) => l.companyId).filter(Boolean)).size || null,
        rows,
        emptyDetailMessage:
          ncLines.length === 0 && (m?.creditNoteCount ?? 0) > 0
            ? "No hay detalle individual disponible para notas de crédito."
            : ncLines.length === 0
              ? "No hay notas de crédito en este período."
              : null,
        moreHref: "/copilot/datos?entity=invoices",
        moreLabel: "Ver facturas en Datos",
      };
    }
    case "cobrado_aplicado": {
      const total = m?.portfolioResolvedAmount ?? 0;
      const { rows, clientCount } = topClientRowsForCurrency(report, currency);
      return {
        title: METRIC_LABEL.cobrado_aplicado,
        currency,
        periodLabel,
        formula:
          "Σ recibos imputados contra facturas del período (Aplicado, no monto bruto).",
        notes: [
          "No incluye cobros sin imputar.",
          "No mezcla UYU con USD.",
        ],
        total,
        clientCount,
        rows,
        moreHref: "/copilot/clientes",
        moreLabel: "Abrir en Clientes",
      };
    }
    case "pendiente_periodo": {
      const total = m?.totalPending ?? 0;
      const { rows, invoiceCount, clientCount } = topInvoiceRowsForCurrency(report, currency);
      return {
        title: METRIC_LABEL.pendiente_periodo,
        currency,
        periodLabel,
        formula: "Ventas del período − Cobrado aplicado al período.",
        notes: [
          "Saldo abierto al corte de las facturas emitidas en el rango.",
          "Excluye facturas canceladas.",
        ],
        total,
        invoiceCount,
        clientCount,
        rows,
        moreHref: "/copilot/clientes",
        moreLabel: "Abrir en Clientes",
      };
    }
    case "cobranza_efectiva": {
      const net = Math.max(0, (m?.issuedInPeriod ?? 0) - (m?.creditNoteAmount ?? 0));
      const ratio = net > 0 ? (m?.collectedInPeriod ?? 0) / net : 0;
      return {
        title: FINANCIAL_UX_COPY.kpiRegisteredCollectionRateLabel,
        currency,
        periodLabel,
        formula: "Cobros registrados en el período / Ventas netas del período × 100%.",
        notes: [
          FINANCIAL_UX_COPY.kpiRegisteredCollectionRateSubtitle,
          "Solo cobros con recibo registrado por fecha.",
          "No cuenta cobros aplicados a saldo anterior.",
          `Ratio actual: ${(ratio * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`,
        ],
        total: m?.collectedInPeriod ?? 0,
        rows: [],
      };
    }
    case "clientes_en_riesgo": {
      const stale = report.staleClients.filter(
        (c) =>
          c.status === "warning" ||
          c.status === "critical" ||
          c.status === "never_synced"
      );
      // Set completo: el drawer trunca a top inicial y muestra "Ver todos".
      const rows: CarteraKpiBreakdownRow[] = stale.map((c) => ({
        kind: "client",
        label: c.companyName ?? c.companyId,
        secondary: `${c.invoiceCount} factura${c.invoiceCount === 1 ? "" : "s"}`,
        amount:
          (c.pendingByCurrency.UYU ?? 0) + (c.pendingByCurrency.USD ?? 0),
        state: c.status,
        href: `/copilot/clientes/${encodeURIComponent(c.companyId)}`,
      }));
      return {
        title: "Clientes en riesgo",
        currency,
        periodLabel,
        formula:
          "Clientes con datos desactualizados, sin sync o con saldo crítico.",
        notes: [
          "El riesgo aquí es de datos / sync, no necesariamente de mora.",
        ],
        total: stale.length,
        clientCount: stale.length,
        rows,
        moreHref: "/copilot/clientes",
        moreLabel: "Abrir en Clientes",
      };
    }
  }
}


function UsdConsolidatedLine({ total, fxRate }: { total: number; fxRate: number }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-bold tabular-nums text-[var(--copilot-ink)]">
        {formatUsdEquivalent(total)}
      </p>
      <p className="text-[10px] text-[var(--copilot-ink-muted)]">TC {fxRate}</p>
    </div>
  );
}

function UsdConsolidatedBreakdownLine({
  total,
  uyuAmount,
  usdAmount,
  fxRate,
  tone = "default",
}: {
  total: number;
  uyuAmount: number;
  usdAmount: number;
  fxRate: number;
  tone?: "default" | "danger";
}) {
  const valueClass =
    tone === "danger"
      ? "text-[var(--copilot-danger-text-strong)]"
      : "text-[var(--copilot-ink)]";
  return (
    <div className="space-y-0.5">
      <p className={`text-xs font-bold tabular-nums ${valueClass}`}>
        {formatUsdEquivalent(total)}
      </p>
      <div className="space-y-px text-[10px] text-[var(--copilot-ink-muted)]">
        {uyuAmount > 0 && (
          <p>UYU → {formatUsdEquivalent(convertToUsdEquivalent({ uyu: uyuAmount, usd: 0 }, fxRate))}</p>
        )}
        {usdAmount > 0 && <p>{formatUsdEquivalent(usdAmount)}</p>}
        <p>TC {fxRate}</p>
      </div>
    </div>
  );
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
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
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

  const [explain, setExplain] = useState<CarteraKpiExplain | null>(null);
  const openExplain = useCallback(
    (kind: ExplainKind, currency: ReconciliationCurrencyCode) => {
      setExplain(buildExplain(kind, currency, report, index, periodRangeLabel ?? null));
    },
    [report, index, periodRangeLabel]
  );
  const openTotalPendienteExplain = useCallback(
    (currency: ReconciliationCurrencyCode) => {
      const m = index.get(currency);
      if (!m || (m.pendingAtCutoff ?? 0) <= 0) return;
      const detail = topInvoiceRowsForCurrency(report, currency);
      setExplain({
        title: "Deuda actual",
        currency,
        periodLabel: periodRangeLabel ?? null,
        formula:
          "Σ facturas abiertas al corte por moneda (no anuladas, sin canceladas).",
        notes: [
          "Saldo vivo al corte, no del período únicamente.",
          "No mezcla UYU con USD.",
        ],
        total: m.pendingAtCutoff ?? 0,
        invoiceCount: detail.invoiceCount,
        clientCount: detail.clientCount,
        rows: detail.rows,
        moreHref: "/copilot/clientes",
        moreLabel: "Abrir en Clientes",
      });
    },
    [index, report, periodRangeLabel]
  );
  const closeExplain = useCallback(() => setExplain(null), []);

  if (variant === "ventas") {
    const cards: React.ReactNode[] = [];

    if (isUsd) {
      // Vista USD: una card consolidada por concepto (ventas + notas crédito)
      const uyuM = metricFor(index, "UYU");
      const usdM = metricFor(index, "USD");
      const uyuIssued = uyuM?.issuedInPeriodNet ?? 0;
      const usdIssued = usdM?.issuedInPeriodNet ?? 0;

      if (uyuIssued > 0 || usdIssued > 0) {
        const totalIssued = convertToUsdEquivalent({ uyu: uyuIssued, usd: usdIssued }, fxRate);
        cards.push(
          <CompactCard
            key="ventas-usd"
            title={METRIC_LABEL.facturado_periodo}
            onClick={() => openExplain("facturado", uyuIssued > 0 ? "UYU" : "USD")}
            actionLabel="Ver detalle"
          >
            <UsdConsolidatedBreakdownLine
              total={totalIssued}
              uyuAmount={uyuIssued}
              usdAmount={usdIssued}
              fxRate={fxRate}
            />
            {periodRangeLabel ? (
              <p className="text-[10px] text-[var(--copilot-ink-muted)]">{periodRangeLabel}</p>
            ) : null}
          </CompactCard>
        );
      }

      const uyuNc = uyuM?.creditNoteAmount ?? 0;
      const usdNc = usdM?.creditNoteAmount ?? 0;
      if (uyuNc > 0 || usdNc > 0) {
        const totalNc = convertToUsdEquivalent({ uyu: uyuNc, usd: usdNc }, fxRate);
        cards.push(
          <CompactCard
            key="nc-usd"
            title="Notas crédito"
            onClick={() => openExplain("credit_note", uyuNc > 0 ? "UYU" : "USD")}
            actionLabel="Ver detalle"
          >
            <UsdConsolidatedBreakdownLine
              total={totalNc}
              uyuAmount={uyuNc}
              usdAmount={usdNc}
              fxRate={fxRate}
              tone="danger"
            />
          </CompactCard>
        );
      }
    } else {
      // Moneda original: una card por moneda por concepto
      for (const code of CURRENCIES) {
        const m = metricFor(index, code);
        const issued = m?.issuedInPeriodNet ?? 0;
        cards.push(
          <CompactCard
            key={`ventas-${code}`}
            title={`${METRIC_LABEL.facturado_periodo} ${code}`}
            onClick={() => openExplain("facturado", code)}
            actionLabel="Ver detalle"
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
            <CompactCard
              key={`nc-${code}`}
              title={`Notas crédito ${code}`}
              onClick={() => openExplain("credit_note", code)}
              actionLabel="Ver detalle"
            >
              <CurrencyLine
                code={code}
                value={formatCarteraMoney(code, nc, { fractionDigits: 0 })}
                tone="danger"
              />
            </CompactCard>
          );
        }
      }
    }

    if (cards.length === 0) {
      return (
        <p className="text-xs text-[var(--copilot-ink-muted)]">Sin ventas en el período.</p>
      );
    }
    return (
      <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{cards}</div>
        <CarteraKpiExplainDrawer
          explain={explain}
          open={explain !== null}
          onClose={closeExplain}
        />
      </>
    );
  }

  if (variant === "resumen") {
    const preferDominantCurrency = (
      reader: (m: NormalizedCurrencyMetrics | undefined) => number
    ): ReconciliationCurrencyCode | null => {
      const uyu = reader(metricFor(index, "UYU"));
      const usd = reader(metricFor(index, "USD"));
      if (uyu > 0) return "UYU";
      if (usd > 0) return "USD";
      return null;
    };
    return (
      <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CompactCard
            title={FINANCIAL_UX_COPY.kpiCollectedAppliedLabel}
            onClick={() => {
              const c = preferDominantCurrency((m) => m?.portfolioResolvedAmount ?? 0);
              if (c) openExplain("cobrado_aplicado", c);
            }}
            actionLabel="Ver detalle"
          >
            {isUsd ? (
              <UsdConsolidatedLine
                total={convertToUsdEquivalent({
                  uyu: metricFor(index, "UYU")?.portfolioResolvedAmount ?? 0,
                  usd: metricFor(index, "USD")?.portfolioResolvedAmount ?? 0,
                }, fxRate)}
                fxRate={fxRate}
              />
            ) : (
              CURRENCIES.map((code) => {
                const m = metricFor(index, code);
                const v = m?.portfolioResolvedAmount ?? 0;
                return (
                  <CurrencyLine
                    key={code}
                    code={code}
                    value={v > 0 ? formatCarteraMoney(code, v, { fractionDigits: 0 }) : "—"}
                  />
                );
              })
            )}
          </CompactCard>
          <CompactCard
            title="Deuda actual"
            onClick={() => {
              const c = preferDominantCurrency((m) => m?.pendingAtCutoff ?? 0);
              if (c) openTotalPendienteExplain(c);
            }}
            actionLabel="Ver facturas"
          >
            {isUsd ? (
              <UsdConsolidatedLine
                total={convertToUsdEquivalent({
                  uyu: metricFor(index, "UYU")?.pendingAtCutoff ?? 0,
                  usd: metricFor(index, "USD")?.pendingAtCutoff ?? 0,
                }, fxRate)}
                fxRate={fxRate}
              />
            ) : (
              CURRENCIES.map((code) => {
                const v = metricFor(index, code)?.pendingAtCutoff ?? 0;
                return (
                  <CurrencyLine
                    key={code}
                    code={code}
                    value={v > 0 ? formatCarteraMoney(code, v, { fractionDigits: 0 }) : "—"}
                    tone={v > 0 ? "danger" : "muted"}
                  />
                );
              })
            )}
          </CompactCard>
          <CompactCard
            title="Pendiente del período"
            onClick={() => {
              const c = preferDominantCurrency((m) => m?.totalPending ?? 0);
              if (c) openExplain("pendiente_periodo", c);
            }}
            actionLabel="Ver detalle"
          >
            {isUsd ? (
              <UsdConsolidatedLine
                total={convertToUsdEquivalent({
                  uyu: metricFor(index, "UYU")?.totalPending ?? 0,
                  usd: metricFor(index, "USD")?.totalPending ?? 0,
                }, fxRate)}
                fxRate={fxRate}
              />
            ) : (
              CURRENCIES.map((code) => {
                const v = metricFor(index, code)?.totalPending ?? 0;
                return (
                  <CurrencyLine
                    key={code}
                    code={code}
                    value={v > 0 ? formatCarteraMoney(code, v, { fractionDigits: 0 }) : "—"}
                  />
                );
              })
            )}
          </CompactCard>
          <CompactCard
            title={FINANCIAL_UX_COPY.kpiRegisteredCollectionRateLabel}
            onClick={() => {
              const c = preferDominantCurrency((m) => m?.collectedInPeriod ?? 0);
              if (c) openExplain("cobranza_efectiva", c);
            }}
            actionLabel="Ver fórmula"
          >
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
        <CarteraKpiExplainDrawer
          explain={explain}
          open={explain !== null}
          onClose={closeExplain}
        />
      </>
    );
  }

  // cobranza — detalle: clientes en riesgo + explorador (Cobros registrados / ventas
  // ya aparece arriba en "Resumen financiero" — no duplicar).
  const staleCount =
    (report.staleSummary?.warning ?? 0) +
    (report.staleSummary?.critical ?? 0) +
    (report.staleSummary?.never_synced ?? 0);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <CompactCard
        title="Clientes en riesgo"
        onClick={() => openExplain("clientes_en_riesgo", "UYU")}
        actionLabel="Ver detalle"
      >
        <p className="text-lg font-bold tabular-nums text-[var(--copilot-ink)]">
          {formatCarteraInteger(staleCount)}
        </p>
        <p className="text-[10px] text-[var(--copilot-ink-muted)]">
          Con datos desactualizados o sin sync
        </p>
      </CompactCard>
      <CompactCard title="Explorador">
        <p className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
          Ver gestión detallada en la vista Clientes.
        </p>
        <Link
          href="/copilot/clientes"
          className="mt-1 inline-flex text-[11px] font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          Ver clientes con deuda →
        </Link>
      </CompactCard>
      <CarteraKpiExplainDrawer
        explain={explain}
        open={explain !== null}
        onClose={closeExplain}
      />
    </div>
  );
}
