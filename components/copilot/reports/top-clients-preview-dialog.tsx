"use client";

import { useCallback, useState } from "react";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type {
  TopClientsReportModel,
  TopClientsReportSortBy,
} from "@/lib/reports/top-clients-report/build-top-clients-report-model";

import { PreviewFilterControls } from "./preview-filter-controls";
import { ReportPreviewShell } from "./report-preview-shell";
import { ReportSummaryCards } from "./report-summary-cards";
import { ReportTable } from "./report-table";
import type { ReportTableColumn } from "./report-table";
import { useReportFetch } from "./use-report-fetch";
import { usePdfDownload } from "./use-pdf-download";

function nowYear() { return new Date().getFullYear(); }
function nowMonth() { return new Date().getMonth() + 1; }

const SORT_OPTIONS: Array<{ value: TopClientsReportSortBy; label: string }> = [
  { value: "net_sales", label: "Facturación" },
  { value: "debt", label: "Deuda total" },
  { value: "overdue", label: "Deuda vencida" },
];

const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition";
const pillActive =
  "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]";
const pillIdle =
  "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]";

const RISK_COLORS: Record<string, string> = {
  Alto: "text-rose-700 font-semibold",
  Medio: "text-amber-700",
  Bajo: "text-emerald-700",
};

type TopClientRow = TopClientsReportModel["rows"][number];

function getColumns(currency: string): ReportTableColumn<TopClientRow>[] {
  return [
    {
      header: "#",
      cellClassName: "text-xs font-semibold tabular-nums text-[var(--copilot-ink-muted)] w-8",
      render: (r) => String(r.rank),
    },
    {
      header: "Cliente",
      render: (r) => <span className="font-medium">{r.clientName}</span>,
    },
    {
      header: "Facturación",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) =>
        r.netSales > 0 ? formatMoneyCurrency(r.netSales, currency) : "—",
    },
    {
      header: "Deuda total",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) =>
        r.totalDebt > 0 ? formatMoneyCurrency(r.totalDebt, currency) : "—",
    },
    {
      header: "Vencida",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) =>
        r.overdueDebt > 0 ? (
          <span className="text-rose-700">{formatMoneyCurrency(r.overdueDebt, currency)}</span>
        ) : (
          "—"
        ),
    },
    {
      header: "Part. %",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs text-[var(--copilot-ink-muted)]",
      render: (r) => `${r.sharePercent.toFixed(1)}%`,
    },
    {
      header: "Riesgo",
      cellClassName: "text-xs",
      render: (r) => (
        <span className={RISK_COLORS[r.risk] ?? ""}>{r.risk}</span>
      ),
    },
  ];
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function TopClientsPreviewDialog({ open, onClose }: Props) {
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(nowMonth);
  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");
  const [sortBy, setSortBy] = useState<TopClientsReportSortBy>("net_sales");

  const { loading: dlLoading, error: dlError, clearError, download } = usePdfDownload();

  const handleClose = useCallback(() => {
    setYear(nowYear());
    setMonth(nowMonth());
    setCurrency("UYU");
    setSortBy("net_sales");
    onClose();
  }, [onClose]);

  const previewUrl = open
    ? `/api/copilot/reports/top-clients.json?year=${year}&month=${month}&currency=${currency}&sort=${sortBy}`
    : null;

  const { data: model, loading, error } = useReportFetch<TopClientsReportModel>(previewUrl);

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const mm = String(month).padStart(2, "0");
    await download(
      `/api/copilot/reports/top-clients.pdf?year=${year}&month=${month}&currency=${currency}&sort=${sortBy}`,
      `clientes-principales-${year}-${mm}-${currency}-${sortBy}.pdf`
    );
  }, [year, month, currency, sortBy, download, clearError]);

  const sortSlot = (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Ordenar por
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSortBy(opt.value)}
            className={`${pillBase} ${sortBy === opt.value ? pillActive : pillIdle}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  const subtitle = model
    ? `${model.period.label} · ${model.currency === "UYU" ? "Pesos" : "Dólares"}`
    : undefined;

  const top5SharePercent =
    model && model.totals.netSales > 0
      ? model.rows.slice(0, 5).reduce((s, r) => s + r.sharePercent, 0)
      : 0;

  return (
    <ReportPreviewShell
      open={open}
      onClose={handleClose}
      title="Clientes principales"
      subtitle={subtitle}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadLoading={dlLoading}
      downloadError={dlError}
      dialogId="top-clients-preview"
      filterSlot={
        <PreviewFilterControls
          year={year}
          month={month}
          currency={currency}
          onYear={setYear}
          onMonth={setMonth}
          onCurrency={setCurrency}
          extraSlot={sortSlot}
        />
      }
    >
      {loading ? (
        <PreviewLoadingState />
      ) : error ? (
        <PreviewErrorState message={error} />
      ) : !model || model.rows.length === 0 ? (
        <PreviewEmptyState message="Sin clientes con actividad para este período." />
      ) : (
        <>
          <ReportSummaryCards
            metrics={[
              {
                label: "Clientes",
                value: String(model.totals.clientCount),
              },
              {
                label: "Facturación total",
                value: formatMoneyCurrency(model.totals.netSales, model.currency),
                tone: "positive",
              },
              {
                label: "Deuda total",
                value: formatMoneyCurrency(model.totals.totalDebt, model.currency),
                tone: model.totals.totalDebt > 0 ? "warning" : "neutral",
              },
              {
                label: "Top cliente",
                value: model.rows[0]?.clientName ?? "—",
              },
              {
                label: "Concentración top 5",
                value: `${top5SharePercent.toFixed(1)}%`,
                sub: "participación top 5",
              },
            ]}
          />
          <ReportTable
            columns={getColumns(model.currency)}
            rows={model.rows}
            keyExtractor={(r) => `${r.companyId}-${r.rank}`}
            emptyMessage="Sin clientes con actividad."
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
