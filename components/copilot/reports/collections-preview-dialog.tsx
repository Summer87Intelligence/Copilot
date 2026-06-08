"use client";

import { useCallback, useState } from "react";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type { CollectionsReportModel } from "@/lib/reports/collections-report/build-collections-report-model";

import { PreviewFilterControls } from "./preview-filter-controls";
import { ReportPreviewShell } from "./report-preview-shell";
import { ReportSummaryCards } from "./report-summary-cards";
import { ReportTable } from "./report-table";
import type { ReportTableColumn } from "./report-table";
import { useReportFetch } from "./use-report-fetch";
import { usePdfDownload } from "./use-pdf-download";

function nowYear() { return new Date().getFullYear(); }
function nowMonth() { return new Date().getMonth() + 1; }

type CollectionsRow = CollectionsReportModel["rows"][number];

const COLUMNS: ReportTableColumn<CollectionsRow>[] = [
  {
    header: "Fecha",
    cellClassName: "whitespace-nowrap tabular-nums text-xs",
    render: (r) => r.date,
  },
  {
    header: "Documento",
    cellClassName: "text-xs",
    render: (r) => r.documentLabel,
  },
  {
    header: "Cliente",
    render: (r) => <span className="font-medium">{r.clientName}</span>,
  },
  {
    header: "Importe",
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums text-xs font-medium",
    render: (r) => formatMoneyCurrency(r.amount, r.currency),
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CollectionsPreviewDialog({ open, onClose }: Props) {
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
    ? `/api/copilot/reports/collections.json?year=${year}&month=${month}&currency=${currency}`
    : null;

  const { data: model, loading, error } = useReportFetch<CollectionsReportModel>(previewUrl);

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const mm = String(month).padStart(2, "0");
    await download(
      `/api/copilot/reports/collections.pdf?year=${year}&month=${month}&currency=${currency}`,
      `cobranza-${year}-${mm}-${currency}.pdf`
    );
  }, [year, month, currency, download, clearError]);

  const subtitle = model
    ? `${model.period.label} · ${model.currency === "UYU" ? "Pesos" : "Dólares"}`
    : undefined;

  return (
    <ReportPreviewShell
      open={open}
      onClose={handleClose}
      title="Reporte de cobranza"
      subtitle={subtitle}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadLoading={dlLoading}
      downloadError={dlError}
      dialogId="collections-preview"
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
        <PreviewEmptyState message="Sin cobros registrados para este período." />
      ) : (
        <>
          <ReportSummaryCards
            metrics={[
              {
                label: "Total cobrado",
                value: formatMoneyCurrency(model.totals.amount, model.currency),
                tone: "positive",
              },
              {
                label: "Cobros",
                value: String(model.totals.count),
              },
              {
                label: "Período",
                value: model.period.label,
              },
              {
                label: "Moneda",
                value: model.currency,
              },
            ]}
          />
          <ReportTable
            columns={COLUMNS}
            rows={model.rows}
            keyExtractor={(r, i) => `${r.date}-${i}`}
            emptyMessage="Sin cobros registrados para este período."
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
