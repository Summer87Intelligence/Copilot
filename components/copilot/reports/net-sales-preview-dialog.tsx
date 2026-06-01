"use client";

import { useCallback, useEffect, useState } from "react";

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

type NetSalesRow = NetSalesReportModel["rows"][number];

function getColumns(currency: string): ReportTableColumn<NetSalesRow>[] {
  return [
    {
      header: "Cliente",
      render: (r) => <span className="font-medium">{r.clientName}</span>,
    },
    {
      header: "Fact.",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs text-[var(--copilot-ink-muted)]",
      render: (r) => String(r.invoiceCount),
    },
    {
      header: "Ventas brutas",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatMoneyCurrency(r.grossSales, currency),
    },
    {
      header: "NC",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs text-rose-700",
      render: (r) =>
        r.creditNoteTotal > 0
          ? `- ${formatMoneyCurrency(r.creditNoteTotal, currency)}`
          : "—",
    },
    {
      header: "Ventas netas",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs font-semibold",
      render: (r) => formatMoneyCurrency(r.netSales, currency),
    },
    {
      header: "Part. %",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs text-[var(--copilot-ink-muted)]",
      render: (r) => `${r.sharePercent.toFixed(1)}%`,
    },
  ];
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

  useEffect(() => {
    if (!open) return;
    setYear(nowYear());
    setMonth(nowMonth());
    setCurrency("UYU");
  }, [open]);

  const previewUrl = open
    ? `/api/copilot/reports/net-sales.json?year=${year}&month=${month}&currency=${currency}`
    : null;

  const { data: model, loading, error } = useReportFetch<NetSalesReportModel>(previewUrl);

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const mm = String(month).padStart(2, "0");
    await download(
      `/api/copilot/reports/net-sales.pdf?year=${year}&month=${month}&currency=${currency}`,
      `ventas-netas-${year}-${mm}-${currency}.pdf`
    );
  }, [year, month, currency, download, clearError]);

  const subtitle = model
    ? `${model.period.label} · ${model.currency === "UYU" ? "Pesos" : "Dólares"}`
    : undefined;

  return (
    <ReportPreviewShell
      open={open}
      onClose={onClose}
      title="Reporte de ventas netas"
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
      ) : !model || model.rows.length === 0 ? (
        <PreviewEmptyState message="Sin facturación registrada para este período." />
      ) : (
        <>
          <ReportSummaryCards
            metrics={[
              {
                label: "Ventas brutas",
                value: formatMoneyCurrency(model.totals.grossSales, model.currency),
                tone: "neutral",
              },
              {
                label: "Notas de crédito",
                value: model.totals.creditNoteTotal > 0
                  ? `- ${formatMoneyCurrency(model.totals.creditNoteTotal, model.currency)}`
                  : "$ 0",
                tone: model.totals.creditNoteTotal > 0 ? "warning" : "neutral",
              },
              {
                label: "Ventas netas",
                value: formatMoneyCurrency(model.totals.netSales, model.currency),
                tone: "positive",
              },
              {
                label: "Clientes",
                value: String(model.totals.clientCount),
              },
              {
                label: "Facturas",
                value: String(model.totals.invoiceCount),
              },
              {
                label: "NC",
                value: String(model.totals.creditNoteCount),
              },
            ]}
          />
          <ReportTable
            columns={getColumns(model.currency)}
            rows={model.rows}
            keyExtractor={(r) => r.companyId}
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
    <div className="flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-white/60 py-10 text-sm text-[var(--copilot-ink-muted)]">
      {message}
    </div>
  );
}
