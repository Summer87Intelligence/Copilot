"use client";

import { useCallback, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type { ExecutiveMonthlyReportModel } from "@/lib/reports/executive-monthly-report/build-executive-monthly-report-model";

import { PreviewFilterControls } from "./preview-filter-controls";
import { ReportPreviewShell } from "./report-preview-shell";
import { ReportSummaryCards } from "./report-summary-cards";
import { ReportTable } from "./report-table";
import type { ReportTableColumn } from "./report-table";
import { useReportFetch } from "./use-report-fetch";
import { usePdfDownload } from "./use-pdf-download";

function nowYear() { return new Date().getFullYear(); }
function nowMonth() { return new Date().getMonth() + 1; }

type TopClient = ExecutiveMonthlyReportModel["top5Clients"][number];
type TopDebtor = ExecutiveMonthlyReportModel["top5Debtors"][number];

const RISK_COLORS: Record<string, string> = {
  Alto: "text-[var(--copilot-danger-text)] font-semibold",
  Medio: "text-[var(--copilot-warning-text)]",
  Bajo: "text-[var(--copilot-success-text)]",
};

const RISK_BANNER: Record<
  ExecutiveMonthlyReportModel["riskLevel"],
  { bg: string; text: string; icon: typeof AlertCircle }
> = {
  Crítico: { bg: "bg-[var(--copilot-tone-danger-bg)] border-[var(--copilot-danger-border)] text-[var(--copilot-danger-text-strong)]", text: "Riesgo crítico", icon: AlertCircle },
  Atención: { bg: "bg-[var(--copilot-tone-warning-bg)] border-[var(--copilot-warning-border)] text-[var(--copilot-warning-text-strong)]", text: "Requiere atención", icon: AlertTriangle },
  Bajo: { bg: "bg-[var(--copilot-tone-positive-bg)] border-[var(--copilot-success-border)] text-[var(--copilot-success-text-strong)]", text: "Riesgo bajo", icon: CheckCircle2 },
};

function getClientColumns(currency: string): ReportTableColumn<TopClient>[] {
  return [
    {
      header: "#",
      cellClassName: "text-xs font-semibold tabular-nums text-[var(--copilot-ink-muted)] w-8",
      render: (r) => String(r.rank),
    },
    {
      header: "Cliente",
      render: (r) => <span className="font-medium text-sm">{r.clientName}</span>,
    },
    {
      header: "Facturación",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
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

function getDebtorColumns(currency: string): ReportTableColumn<TopDebtor>[] {
  return [
    {
      header: "#",
      cellClassName: "text-xs font-semibold tabular-nums text-[var(--copilot-ink-muted)] w-8",
      render: (r) => String(r.rank),
    },
    {
      header: "Cliente",
      render: (r) => <span className="font-medium text-sm">{r.clientName}</span>,
    },
    {
      header: "Deuda",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatMoneyCurrency(r.debtAmount, currency),
    },
    {
      header: "Vencida",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) =>
        r.overdueAmount > 0 ? (
          <span className="text-[var(--copilot-danger-text)]">{formatMoneyCurrency(r.overdueAmount, currency)}</span>
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
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
      {children}
    </p>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ExecutiveMonthlyPreviewDialog({ open, onClose }: Props) {
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
    ? `/api/copilot/reports/executive-monthly.json?year=${year}&month=${month}&currency=${currency}`
    : null;

  const { data: model, loading, error } = useReportFetch<ExecutiveMonthlyReportModel>(previewUrl);

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const mm = String(month).padStart(2, "0");
    await download(
      `/api/copilot/reports/executive-monthly.pdf?year=${year}&month=${month}&currency=${currency}`,
      `ejecutivo-${year}-${mm}-${currency}.pdf`
    );
  }, [year, month, currency, download, clearError]);

  const subtitle = model
    ? `${model.period.label} · ${model.currency === "UYU" ? "Pesos" : "Dólares"}`
    : undefined;

  const banner = model ? RISK_BANNER[model.riskLevel] : null;
  const BannerIcon = banner?.icon;

  return (
    <ReportPreviewShell
      open={open}
      onClose={handleClose}
      title="Reporte ejecutivo mensual"
      subtitle={subtitle}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadLoading={dlLoading}
      downloadError={dlError}
      dialogId="executive-monthly-preview"
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
        <PreviewEmptyState message="No hay movimientos para el período seleccionado." />
      ) : (
        <>
          {/* Risk banner */}
          {banner && BannerIcon ? (
            <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${banner.bg}`}>
              <BannerIcon className="h-4 w-4 shrink-0" aria-hidden />
              {banner.text}: {model.riskLevel}
            </div>
          ) : null}

          {/* Alerts */}
          {model.alerts.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {model.alerts.map((alert, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-1.5 text-[var(--copilot-warning-text-strong)]"
                >
                  • {alert}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Key metrics */}
          <div>
            <SectionLabel>Indicadores clave</SectionLabel>
            <div className="mt-2">
              <ReportSummaryCards
                metrics={[
                  {
                    label: "Ventas",
                    value: formatMoneyCurrency(model.keyMetrics.netSales, model.currency),
                    tone: "positive",
                  },
                  {
                    label: "Saldo de caja",
                    value: formatMoneyCurrency(model.keyMetrics.cashClosingBalance, model.currency),
                    tone: model.keyMetrics.cashClosingBalance >= 0 ? "positive" : "danger",
                  },
                  {
                    label: "Deuda actual",
                    value: formatMoneyCurrency(model.keyMetrics.totalDebt, model.currency),
                    tone: model.keyMetrics.totalDebt > 0 ? "warning" : "neutral",
                  },
                  {
                    label: "Deuda vencida",
                    value: formatMoneyCurrency(model.keyMetrics.overdueDebt, model.currency),
                    tone: model.keyMetrics.overdueDebt > 0 ? "danger" : "neutral",
                  },
                  {
                    label: "Clientes activos",
                    value: String(model.keyMetrics.activeClients),
                  },
                ]}
              />
            </div>
          </div>

          {/* Top 5 clients */}
          {model.top5Clients.length > 0 ? (
            <div>
              <SectionLabel>Top 5 clientes del período</SectionLabel>
              <div className="mt-2">
                <ReportTable
                  columns={getClientColumns(model.currency)}
                  rows={model.top5Clients}
                  keyExtractor={(r) => String(r.rank)}
                  emptyMessage="No hay clientes con movimiento en este período."
                />
              </div>
            </div>
          ) : null}

          {/* Top 5 debtors */}
          {model.top5Debtors.length > 0 ? (
            <div>
              <SectionLabel>Top 5 deudores</SectionLabel>
              <div className="mt-2">
                <ReportTable
                  columns={getDebtorColumns(model.currency)}
                  rows={model.top5Debtors}
                  keyExtractor={(r) => String(r.rank)}
                  emptyMessage="Sin deudores."
                />
              </div>
            </div>
          ) : null}

          {/* Caja summary */}
          <div>
            <SectionLabel>Caja del mes</SectionLabel>
            <div className="mt-2">
              <ReportSummaryCards
                metrics={[
                  {
                    label: "Saldo inicial",
                    value: formatMoneyCurrency(model.keyMetrics.cashOpeningBalance, model.currency),
                    tone: "neutral",
                  },
                  {
                    label: "Ingresos",
                    value: formatMoneyCurrency(model.keyMetrics.cashIncome, model.currency),
                    tone: "positive",
                  },
                  {
                    label: "Egresos",
                    value: formatMoneyCurrency(model.keyMetrics.cashExpense, model.currency),
                    tone: model.keyMetrics.cashExpense > 0 ? "warning" : "neutral",
                  },
                  {
                    label: "Saldo final",
                    value: formatMoneyCurrency(model.keyMetrics.cashClosingBalance, model.currency),
                    tone: model.keyMetrics.cashClosingBalance >= 0 ? "positive" : "danger",
                  },
                ]}
              />
            </div>
          </div>
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
    <div className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-3 text-sm text-[var(--copilot-danger-text-strong)]">
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
