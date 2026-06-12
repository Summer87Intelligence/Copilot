"use client";

import { useCallback, useState } from "react";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";

import { ReportPreviewShell } from "./report-preview-shell";
import { ReportSummaryCards } from "./report-summary-cards";
import type { SummaryMetric } from "./report-summary-cards";
import { ReportTable } from "./report-table";
import type { ReportTableColumn } from "./report-table";
import { usePdfDownload } from "./use-pdf-download";

type CurrencyFilter = "UYU" | "USD" | "all";

type StatementRow = {
  companyId: string;
  name: string;
  currency: "UYU" | "USD";
  balance: number;
  overdue: number;
  risk: string;
};

const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition";
const pillActive =
  "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]";
const pillIdle =
  "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]";

const RISK_COLORS: Record<string, string> = {
  Alto: "text-[var(--copilot-danger-text)] font-semibold",
  Medio: "text-[var(--copilot-warning-text)]",
  Bajo: "text-[var(--copilot-success-text)]",
};

const CURRENCY_OPTIONS: Array<{ value: CurrencyFilter; label: string }> = [
  { value: "UYU", label: "Pesos" },
  { value: "USD", label: "Dólares" },
  { value: "all", label: "UYU + USD" },
];

const COLUMNS: ReportTableColumn<StatementRow>[] = [
  {
    header: "Cliente",
    render: (r) => <span className="font-medium">{r.name}</span>,
  },
  {
    header: "Moneda",
    cellClassName: "text-xs text-[var(--copilot-ink-muted)]",
    render: (r) => r.currency,
  },
  {
    header: "Deuda actual",
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums text-xs",
    render: (r) => formatMoneyCurrency(r.balance, r.currency),
  },
  {
    header: "Deuda vencida",
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums text-xs",
    render: (r) =>
      r.overdue > 0 ? (
        <span className="text-[var(--copilot-danger-text)]">{formatMoneyCurrency(r.overdue, r.currency)}</span>
      ) : (
        "—"
      ),
  },
  {
    header: "Riesgo",
    cellClassName: "text-xs",
    render: (r) => <span className={RISK_COLORS[r.risk] ?? ""}>{r.risk}</span>,
  },
];

function buildRows(
  portfolioRows: ClientPortfolioRow[],
  currency: CurrencyFilter
): { uyuRows: StatementRow[]; usdRows: StatementRow[] } {
  const uyuRows: StatementRow[] = [];
  const usdRows: StatementRow[] = [];

  if (currency !== "USD") {
    for (const r of portfolioRows) {
      const balance = r.debt_uyu ?? 0;
      if (balance > 0) {
        uyuRows.push({
          companyId: r.company_id,
          name: r.name,
          currency: "UYU",
          balance,
          overdue: r.overdue_uyu ?? 0,
          risk: r.risk,
        });
      }
    }
    uyuRows.sort((a, b) => b.balance - a.balance);
  }

  if (currency !== "UYU") {
    for (const r of portfolioRows) {
      const balance = r.debt_usd ?? 0;
      if (balance > 0) {
        usdRows.push({
          companyId: r.company_id,
          name: r.name,
          currency: "USD",
          balance,
          overdue: r.overdue_usd ?? 0,
          risk: r.risk,
        });
      }
    }
    usdRows.sort((a, b) => b.balance - a.balance);
  }

  return { uyuRows, usdRows };
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-accent)]">
      {label}
    </p>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  portfolioRows: ClientPortfolioRow[];
};

export function AccountStatementsPreviewDialog({ open, onClose, portfolioRows }: Props) {
  const [currency, setCurrency] = useState<CurrencyFilter>("UYU");

  const { loading: dlLoading, error: dlError, clearError, download } = usePdfDownload();

  const handleClose = useCallback(() => {
    setCurrency("UYU");
    onClose();
  }, [onClose]);

  const { uyuRows, usdRows } = buildRows(portfolioRows, currency);
  const singleRows = currency === "UYU" ? uyuRows : usdRows;
  const isEmpty =
    currency === "all"
      ? uyuRows.length + usdRows.length === 0
      : singleRows.length === 0;

  const uniqueClientCount = (() => {
    const ids = new Set<string>();
    for (const r of uyuRows) ids.add(r.companyId);
    for (const r of usdRows) ids.add(r.companyId);
    return ids.size;
  })();

  const totalUyu = uyuRows.reduce((s, r) => s + r.balance, 0);
  const totalUsd = usdRows.reduce((s, r) => s + r.balance, 0);
  const topDebtor =
    [...uyuRows, ...usdRows].sort((a, b) => b.balance - a.balance)[0]?.name ?? "—";

  const summaryMetrics: SummaryMetric[] = [
    { label: "Clientes con saldo", value: String(uniqueClientCount) },
    ...(currency !== "USD"
      ? [{ label: "Total UYU", value: formatMoneyCurrency(totalUyu, "UYU"), tone: totalUyu > 0 ? "warning" as const : "neutral" as const }]
      : []),
    ...(currency !== "UYU"
      ? [{ label: "Total USD", value: formatMoneyCurrency(totalUsd, "USD"), tone: totalUsd > 0 ? "warning" as const : "neutral" as const }]
      : []),
    { label: "Mayor deudor", value: topDebtor },
  ];

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const todayStr = new Date().toISOString().slice(0, 10);
    const curSlug = currency === "all" ? "uyu-usd" : currency.toLowerCase();
    const curParam = currency === "all" ? "all" : currency;
    await download(
      `/api/copilot/reports/account-statements.pdf?currency=${curParam}`,
      `estados-cuenta-clientes-${curSlug}-${todayStr}.pdf`
    );
  }, [currency, download, clearError]);

  const filterSlot = (
    <div className="space-y-3">
      <p className="text-xs text-[var(--copilot-ink-muted)]">
        Estados de cuenta vigentes desde 2026.
      </p>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Moneda
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {CURRENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCurrency(opt.value)}
              className={`${pillBase} ${currency === opt.value ? pillActive : pillIdle}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const subtitle =
    currency === "all" ? "Pesos + Dólares · vigentes desde 2026" :
    currency === "UYU" ? "Pesos · vigentes desde 2026" : "Dólares · vigentes desde 2026";

  return (
    <ReportPreviewShell
      open={open}
      onClose={handleClose}
      title="Estado de cuenta por cliente"
      subtitle={subtitle}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadLoading={dlLoading}
      downloadError={dlError}
      dialogId="account-statements-preview"
      filterSlot={filterSlot}
    >
      {isEmpty ? (
        <div className="flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 py-10 text-sm text-[var(--copilot-ink-muted)]">
          Sin clientes con saldo para la moneda seleccionada.
        </div>
      ) : (
        <>
          <ReportSummaryCards metrics={summaryMetrics} />

          {currency === "all" ? (
            <div className="space-y-4">
              {uyuRows.length > 0 && (
                <div className="space-y-2">
                  <SectionLabel label="Pesos (UYU)" />
                  <ReportTable
                    columns={COLUMNS}
                    rows={uyuRows}
                    keyExtractor={(r) => `${r.companyId}-UYU`}
                    emptyMessage="Sin clientes con saldo en pesos."
                  />
                </div>
              )}
              {usdRows.length > 0 && (
                <div className="space-y-2">
                  <SectionLabel label="Dólares (USD)" />
                  <ReportTable
                    columns={COLUMNS}
                    rows={usdRows}
                    keyExtractor={(r) => `${r.companyId}-USD`}
                    emptyMessage="Sin clientes con saldo en dólares."
                  />
                </div>
              )}
            </div>
          ) : (
            <ReportTable
              columns={COLUMNS}
              rows={singleRows}
              keyExtractor={(r) => `${r.companyId}-${r.currency}`}
              emptyMessage="Sin clientes con saldo para la moneda seleccionada."
            />
          )}
        </>
      )}
    </ReportPreviewShell>
  );
}
