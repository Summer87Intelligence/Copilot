"use client";

import { useCallback, useMemo, useState } from "react";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { buildDebtorsReportModel } from "@/lib/reports/debtors-report/build-debtors-report-model";
import { debtorsReportFiltersToSearchParams } from "@/lib/reports/debtors-report/debtors-report-filters";
import {
  DEFAULT_DEBTORS_REPORT_FILTERS,
  type DebtorsReportFilters,
  type DebtorsReportRow,
} from "@/lib/reports/debtors-report/debtors-report-types";

import { ReportPreviewShell } from "./report-preview-shell";
import { ReportSummaryCards } from "./report-summary-cards";
import { ReportTable } from "./report-table";
import type { ReportTableColumn } from "./report-table";
import { usePdfDownload } from "./use-pdf-download";

const CURRENCY_OPTIONS: Array<{ id: DebtorsReportFilters["currency"]; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "UYU", label: "Pesos" },
  { id: "USD", label: "Dólares" },
];

const STATUS_OPTIONS: Array<{ id: DebtorsReportFilters["status"]; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "overdue", label: "Atrasados" },
  { id: "critical", label: "Críticos" },
  { id: "without_contact", label: "Sin contacto" },
];

const pillBase = "rounded-full px-2.5 py-1 text-xs font-medium transition";
const pillActive =
  "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]";
const pillIdle =
  "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]";

function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`${pillBase} ${value === opt.id ? pillActive : pillIdle}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  Crítico: "text-[var(--copilot-danger-text)] font-semibold",
  Atrasado: "text-[var(--copilot-warning-text)]",
  Vencido: "text-[var(--copilot-warning-text)]",
  Pendiente: "text-[var(--copilot-ink-muted)]",
};

const COLUMNS: ReportTableColumn<DebtorsReportRow>[] = [
  {
    header: "Cliente",
    render: (r) => <span className="font-medium">{r.clientName}</span>,
  },
  {
    header: "Moneda",
    cellClassName: "text-xs text-[var(--copilot-ink-muted)]",
    render: (r) => r.currency,
  },
  {
    header: "Deuda actual",
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums text-xs font-medium",
    render: (r) => formatMoneyCurrency(r.debtAmount, r.currency),
  },
  {
    header: "Atrasada",
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums text-xs",
    render: (r) =>
      r.overdueAmount > 0 ? (
        <span className="text-[var(--copilot-danger-text)]">{formatMoneyCurrency(r.overdueAmount, r.currency)}</span>
      ) : (
        "—"
      ),
  },
  {
    header: "Días atraso",
    headerClassName: "text-right",
    cellClassName: "text-right tabular-nums text-xs text-[var(--copilot-ink-muted)]",
    render: (r) => r.overdueDaysLabel,
  },
  {
    header: "Contacto",
    cellClassName: "text-xs text-[var(--copilot-ink-muted)] max-w-[140px] truncate",
    render: (r) => r.contactLabel || "—",
  },
  {
    header: "Estado",
    cellClassName: "text-xs",
    render: (r) => (
      <span className={STATUS_COLORS[r.statusLabel] ?? ""}>{r.statusLabel}</span>
    ),
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  portfolioRows: ClientPortfolioLoad["rows"];
  portfolioDetails?: ClientPortfolioLoad["details"];
};

export function DebtorsPreviewDialog({
  open,
  onClose,
  portfolioRows,
  portfolioDetails,
}: Props) {
  const [filters, setFilters] = useState<DebtorsReportFilters>(DEFAULT_DEBTORS_REPORT_FILTERS);

  const { loading: dlLoading, error: dlError, clearError, download } = usePdfDownload();

  const handleClose = useCallback(() => {
    setFilters(DEFAULT_DEBTORS_REPORT_FILTERS);
    onClose();
  }, [onClose]);

  const model = useMemo(() => {
    if (!open) return null;
    return buildDebtorsReportModel({
      portfolioRows,
      details: portfolioDetails,
      filters,
      emittedAt: new Date(),
    });
  }, [open, portfolioRows, portfolioDetails, filters]);

  const handleDownloadPdf = useCallback(async () => {
    clearError();
    const sp = debtorsReportFiltersToSearchParams(filters);
    await download(
      `/api/copilot/reports/debtors.pdf?${sp.toString()}`,
      `reporte-deudores-${new Date().toISOString().slice(0, 10)}.pdf`
    );
  }, [filters, download, clearError]);

  const setPartial = useCallback(
    (patch: Partial<DebtorsReportFilters>) => setFilters((prev) => ({ ...prev, ...patch })),
    []
  );

  const filterSlot = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        <FilterPills
          label="Moneda"
          options={CURRENCY_OPTIONS}
          value={filters.currency}
          onChange={(currency) => setPartial({ currency })}
        />
        <FilterPills
          label="Estado"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(status) => setPartial({ status })}
        />
      </div>
      {model ? (
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          <span className="font-semibold tabular-nums text-[var(--copilot-ink)]">
            {model.totals.clientsCount}
          </span>{" "}
          {model.totals.clientsCount === 1 ? "cliente incluido" : "clientes incluidos"}
        </p>
      ) : null}
    </div>
  );

  const totals = model?.totals;
  const subtitle = "Clientes con deuda pendiente";

  return (
    <ReportPreviewShell
      open={open}
      onClose={handleClose}
      title="Reporte de deudores"
      subtitle={subtitle}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadLoading={dlLoading}
      downloadError={dlError}
      dialogId="debtors-preview"
      filterSlot={filterSlot}
    >
      {!model || model.rows.length === 0 ? (
        <PreviewEmptyState message="Sin clientes con deuda para los filtros seleccionados." />
      ) : (
        <>
          <ReportSummaryCards
            metrics={[
              {
                label: "Clientes",
                value: String(totals?.clientsCount ?? 0),
              },
              ...(totals && totals.totalDebtUyu > 0
                ? [
                    {
                      label: "Deuda UYU",
                      value: formatMoneyCurrency(totals.totalDebtUyu, "UYU"),
                      tone: "warning" as const,
                    },
                  ]
                : []),
              ...(totals && totals.totalDebtUsd > 0
                ? [
                    {
                      label: "Deuda USD",
                      value: formatMoneyCurrency(totals.totalDebtUsd, "USD"),
                      tone: "warning" as const,
                    },
                  ]
                : []),
              ...(totals && totals.totalOverdueUyu > 0
                ? [
                    {
                      label: "Atrasada UYU",
                      value: formatMoneyCurrency(totals.totalOverdueUyu, "UYU"),
                      tone: "danger" as const,
                    },
                  ]
                : []),
              ...(totals && totals.totalOverdueUsd > 0
                ? [
                    {
                      label: "Atrasada USD",
                      value: formatMoneyCurrency(totals.totalOverdueUsd, "USD"),
                      tone: "danger" as const,
                    },
                  ]
                : []),
            ]}
          />
          <ReportTable
            columns={COLUMNS}
            rows={model.rows}
            keyExtractor={(r, i) => `${r.clientId}-${r.currency}-${i}`}
            emptyMessage="Sin clientes con deuda."
          />
        </>
      )}
    </ReportPreviewShell>
  );
}

function PreviewEmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 py-10 text-sm text-[var(--copilot-ink-muted)]">
      {message}
    </div>
  );
}
