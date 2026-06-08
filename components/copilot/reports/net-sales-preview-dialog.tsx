"use client";

import { useCallback, useState } from "react";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type { NetSalesReportModel } from "@/lib/reports/net-sales-report/build-net-sales-report-model";

import { PreviewFilterControls } from "./preview-filter-controls";
import { ReportPreviewShell } from "./report-preview-shell";
import { ReportSummaryCards } from "./report-summary-cards";
import { ReportTable } from "./report-table";
import type { ReportTableColumn } from "./report-table";
import { useReportFetch } from "./use-report-fetch";
import { usePdfDownload } from "./use-pdf-download";

function nowYear() { return new Date().getFullYear(); }
function nowMonth() { return new Date().getMonth() + 1; }

type NetSalesInvoiceRow = NetSalesReportModel["invoiceRows"][number];

function getInvoiceColumns(currency: string): ReportTableColumn<NetSalesInvoiceRow>[] {
  return [
    {
      header: "Fecha",
      render: (r) => {
        const [y, m, d] = r.issueDate.split("-");
        return y && m && d ? `${d}/${m}/${y}` : r.issueDate;
      },
    },
    {
      header: "Número de factura",
      render: (r) => <span className="tabular-nums">{r.invoiceNumber}</span>,
    },
    {
      header: "Cliente",
      render: (r) => <span className="font-medium">{r.clientName}</span>,
    },
    {
      header: "Importe",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs font-semibold",
      render: (r) => formatMoneyCurrency(r.amount, currency),
    },
  ];
}

function formatPeriodLabel(from: string, to: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return y && m && d ? `${d}/${m}/${y}` : ymd;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function NetSalesPreviewDialog({ open, onClose }: Props) {
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
    ? `/api/copilot/reports/net-sales.json?year=${year}&month=${month}&currency=${currency}`
    : null;

  const { data: model, loading, error } = useReportFetch<NetSalesReportModel>(previewUrl);

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const mm = String(month).padStart(2, "0");
    await download(
      `/api/copilot/reports/net-sales.pdf?year=${year}&month=${month}&currency=${currency}`,
      `ventas-${year}-${mm}-${currency}.pdf`
    );
  }, [year, month, currency, download, clearError]);

  const subtitle = model
    ? `Período: ${formatPeriodLabel(model.period.from, model.period.to)} · ${model.currency}`
    : undefined;

  return (
    <ReportPreviewShell
      open={open}
      onClose={handleClose}
      title="Reporte de ventas"
      subtitle={subtitle}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadLoading={dlLoading}
      downloadError={dlError}
      dialogId="net-sales-preview"
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
      ) : !model || model.invoiceRows.length === 0 ? (
        <PreviewEmptyState message="Sin facturación registrada para este período." />
      ) : (
        <>
          <ReportSummaryCards
            metrics={[
              {
                label: "Moneda",
                value: model.currency,
              },
              {
                label: "Facturas",
                value: String(model.invoiceRows.filter((r) => !r.isCreditNote).length),
              },
              {
                label: "Total ventas",
                value: formatMoneyCurrency(model.totals.invoiceRowsTotal, model.currency),
                tone: "positive",
              },
            ]}
          />
          <ReportTable
            columns={getInvoiceColumns(model.currency)}
            rows={model.invoiceRows}
            keyExtractor={(r) => r.invoiceId}
            emptyMessage="Sin facturación para este período."
          />
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
