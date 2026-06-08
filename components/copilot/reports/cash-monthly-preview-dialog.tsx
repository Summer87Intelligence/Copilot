"use client";

import { useCallback, useState } from "react";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type { CashMonthlyReportModel } from "@/lib/reports/cash-monthly-report/build-cash-monthly-report-model";

import { PreviewFilterControls } from "./preview-filter-controls";
import { ReportPreviewShell } from "./report-preview-shell";
import { ReportSummaryCards } from "./report-summary-cards";
import { ReportTable } from "./report-table";
import type { ReportTableColumn } from "./report-table";
import { useReportFetch } from "./use-report-fetch";
import { usePdfDownload } from "./use-pdf-download";

function nowYear() { return new Date().getFullYear(); }
function nowMonth() { return new Date().getMonth() + 1; }

type CashRow = CashMonthlyReportModel["rows"][number];

function getColumns(currency: string): ReportTableColumn<CashRow>[] {
  return [
    {
      header: "Fecha",
      cellClassName: "whitespace-nowrap tabular-nums text-xs",
      render: (r) => r.date,
    },
    {
      header: "Tipo",
      cellClassName: "text-xs",
      render: (r) => r.typeLabel,
    },
    {
      header: "Concepto",
      render: (r) => <span className="text-sm">{r.concept}</span>,
    },
    {
      header: "Ingreso",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) =>
        r.income > 0 ? (
          <span className="font-medium text-emerald-700">
            {formatMoneyCurrency(r.income, currency)}
          </span>
        ) : (
          <span className="text-[var(--copilot-ink-muted)]">—</span>
        ),
    },
    {
      header: "Egreso",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) =>
        r.expense > 0 ? (
          <span className="font-medium text-rose-700">
            {formatMoneyCurrency(r.expense, currency)}
          </span>
        ) : (
          <span className="text-[var(--copilot-ink-muted)]">—</span>
        ),
    },
    {
      header: "Saldo",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs font-semibold",
      render: (r) => (
        <span className={r.runningBalance >= 0 ? "text-emerald-700" : "text-rose-700"}>
          {formatMoneyCurrency(r.runningBalance, currency)}
        </span>
      ),
    },
  ];
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CashMonthlyPreviewDialog({ open, onClose }: Props) {
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(nowMonth);
  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");

  const { loading: dlLoading, error: dlError, clearError, download } = usePdfDownload();

  const handleClose = useCallback(() => {
    setYear(nowYear());
    setMonth(nowMonth());
    setCurrency("UYU");
    onClose();
  }, [onClose]);

  const previewUrl = open
    ? `/api/copilot/reports/cash-monthly.json?year=${year}&month=${month}&currency=${currency}`
    : null;

  const { data: model, loading, error } = useReportFetch<CashMonthlyReportModel>(previewUrl);

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const mm = String(month).padStart(2, "0");
    await download(
      `/api/copilot/reports/cash-monthly.pdf?year=${year}&month=${month}&currency=${currency}`,
      `caja-${year}-${mm}-${currency}.pdf`
    );
  }, [year, month, currency, download, clearError]);

  const subtitle = model
    ? `${model.period.label} · ${model.currency === "UYU" ? "Pesos" : "Dólares"}`
    : undefined;

  const closingBalance = model?.totals.closingBalance ?? 0;
  const closingTone = closingBalance >= 0 ? "positive" : "danger";

  return (
    <ReportPreviewShell
      open={open}
      onClose={handleClose}
      title="Reporte de caja mensual"
      subtitle={subtitle}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadLoading={dlLoading}
      downloadError={dlError}
      dialogId="cash-monthly-preview"
      filterSlot={
        <PreviewFilterControls
          year={year}
          month={month}
          currency={currency}
          onYear={setYear}
          onMonth={setMonth}
          onCurrency={setCurrency}
        />
      }
    >
      {loading ? (
        <PreviewLoadingState />
      ) : error ? (
        <PreviewErrorState message={error} />
      ) : !model ? (
        <PreviewEmptyState message="Sin movimientos para este período." />
      ) : (
        <>
          <ReportSummaryCards
            metrics={[
              {
                label: "Saldo inicial",
                value: formatMoneyCurrency(model.openingBalance, model.currency),
                tone: "neutral",
              },
              {
                label: "Ingresos",
                value: formatMoneyCurrency(model.totals.totalIncome, model.currency),
                tone: "positive",
              },
              {
                label: "Egresos",
                value: formatMoneyCurrency(model.totals.totalExpense, model.currency),
                tone: model.totals.totalExpense > 0 ? "warning" : "neutral",
              },
              {
                label: "Saldo final",
                value: formatMoneyCurrency(closingBalance, model.currency),
                tone: closingTone,
              },
              {
                label: "Movimientos",
                value: String(model.totals.count),
              },
            ]}
          />
          {model.rows.length === 0 ? (
            <PreviewEmptyState message="Sin movimientos para este período." />
          ) : (
            <ReportTable
              columns={getColumns(model.currency)}
              rows={model.rows}
              keyExtractor={(r, i) => `${r.date}-${i}`}
              emptyMessage="Sin movimientos para este período."
            />
          )}
        </>
      )}
    </ReportPreviewShell>
  );
}

function PreviewLoadingState() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-[var(--copilot-ink-muted)]">
      Cargando reporte…
    </div>
  );
}

function PreviewErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      No pudimos cargar este reporte. {message}
    </div>
  );
}

function PreviewEmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 py-10 text-sm text-[var(--copilot-ink-muted)]">
      {message}
    </div>
  );
}
