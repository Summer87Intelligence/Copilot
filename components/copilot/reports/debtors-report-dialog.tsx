"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, X } from "lucide-react";

import { CopilotGhostButton } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { countDebtorsReportRows } from "@/lib/reports/debtors-report/build-debtors-report-model";
import { debtorsReportFiltersToSearchParams } from "@/lib/reports/debtors-report/debtors-report-filters";
import type { DebtorsReportFilters } from "@/lib/reports/debtors-report/debtors-report-types";
import { DEFAULT_DEBTORS_REPORT_FILTERS } from "@/lib/reports/debtors-report/debtors-report-types";

type Props = {
  open: boolean;
  onClose: () => void;
  portfolioRows: ClientPortfolioLoad["rows"];
  portfolioDetails?: ClientPortfolioLoad["details"];
  defaultFilters?: Partial<DebtorsReportFilters>;
  hint?: string;
};

const CURRENCY_OPTIONS: Array<{ id: DebtorsReportFilters["currency"]; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "UYU", label: "Solo pesos" },
  { id: "USD", label: "Solo dólares" },
];

const STATUS_OPTIONS: Array<{ id: DebtorsReportFilters["status"]; label: string }> = [
  { id: "all", label: "Todos con deuda" },
  { id: "overdue", label: "Solo vencidos" },
  { id: "critical", label: "Solo críticos" },
  { id: "without_contact", label: "Solo sin contacto" },
];

const OVERDUE_OPTIONS: Array<{ id: DebtorsReportFilters["overdueDays"]; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "30", label: "Vencidos más de 30 días" },
  { id: "60", label: "Vencidos más de 60 días" },
  { id: "90", label: "Vencidos más de 90 días" },
];

const CONTACT_OPTIONS: Array<{ id: DebtorsReportFilters["contact"]; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "with_contact", label: "Con WhatsApp/email" },
  { id: "without_contact", label: "Sin contacto" },
];

function mergeFilters(
  base: DebtorsReportFilters,
  patch?: Partial<DebtorsReportFilters>
): DebtorsReportFilters {
  return { ...base, ...patch };
}

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
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                  : "bg-white/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DebtorsReportDialog({
  open,
  onClose,
  portfolioRows,
  portfolioDetails,
  defaultFilters,
  hint,
}: Props) {
  const [filters, setFilters] = useState<DebtorsReportFilters>(() =>
    mergeFilters(DEFAULT_DEBTORS_REPORT_FILTERS, defaultFilters)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFilters(mergeFilters(DEFAULT_DEBTORS_REPORT_FILTERS, defaultFilters));
    setError(null);
  }, [open, defaultFilters]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  const previewCount = useMemo(
    () =>
      countDebtorsReportRows({
        portfolioRows,
        details: portfolioDetails,
        filters,
      }),
    [portfolioRows, portfolioDetails, filters]
  );

  const setPartial = useCallback((patch: Partial<DebtorsReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = debtorsReportFiltersToSearchParams(filters);
      const url = `/api/copilot/reports/debtors.pdf?${sp.toString()}`;
      const res = await copilotApiFetch(url);
      if (!res.ok) {
        let message = "No se pudo generar el PDF.";
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          /* ignore */
        }
        setError(message);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.href = objectUrl;
      a.download = match?.[1] ?? `reporte-deudores-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al descargar el reporte.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debtors-report-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <h2 id="debtors-report-title" className="text-base font-semibold text-[var(--copilot-ink)]">
              Generar reporte de deudores
            </h2>
            <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
              Seleccioná qué clientes incluir en el PDF.
            </p>
            {hint ? (
              <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{hint}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-black/[0.04] disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
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

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Monto mínimo
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <label className="block text-xs text-[var(--copilot-ink-muted)]">
                Mínimo UYU
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={filters.minUyu || ""}
                  onChange={(e) =>
                    setPartial({ minUyu: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-sm tabular-nums text-[var(--copilot-ink)]"
                  placeholder="0"
                />
              </label>
              <label className="block text-xs text-[var(--copilot-ink-muted)]">
                Mínimo USD
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={filters.minUsd || ""}
                  onChange={(e) =>
                    setPartial({ minUsd: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-sm tabular-nums text-[var(--copilot-ink)]"
                  placeholder="0"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPartial({ minUyu: 20000, minUsd: 0 })}
                className="rounded-full border border-[var(--copilot-border)] bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
              >
                UYU &gt; 20.000
              </button>
              <button
                type="button"
                onClick={() => setPartial({ minUyu: 0, minUsd: 1000 })}
                className="rounded-full border border-[var(--copilot-border)] bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
              >
                USD &gt; 1.000
              </button>
              <button
                type="button"
                onClick={() => setPartial({ minUyu: 0, minUsd: 0 })}
                className="rounded-full border border-[var(--copilot-border)] bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
              >
                Limpiar mínimos
              </button>
            </div>
          </div>

          <FilterPills
            label="Antigüedad"
            options={OVERDUE_OPTIONS}
            value={filters.overdueDays}
            onChange={(overdueDays) => setPartial({ overdueDays })}
          />
          <FilterPills
            label="Contacto"
            options={CONTACT_OPTIONS}
            value={filters.contact}
            onChange={(contact) => setPartial({ contact })}
          />

          <div className="rounded-xl border border-[var(--copilot-border)]/80 bg-[rgba(31,107,74,0.04)] px-3 py-2.5 text-sm text-[var(--copilot-ink)]">
            <span className="font-semibold tabular-nums">{previewCount}</span>{" "}
            {previewCount === 1 ? "cliente será incluido" : "clientes serán incluidos"}.
            {!portfolioDetails && filters.overdueDays !== "all" ? (
              <span className="mt-1 block text-xs text-[var(--copilot-ink-muted)]">
                La antigüedad exacta se calcula al generar el PDF.
              </span>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--copilot-border)] px-5 py-3">
          <CopilotGhostButton type="button" onClick={onClose} disabled={loading}>
            Cancelar
          </CopilotGhostButton>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="h-4 w-4" aria-hidden />
            )}
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function DebtorsReportTrigger({
  portfolioRows,
  portfolioDetails,
  defaultFilters,
  hint,
  className = "",
  label = "Generar PDF",
}: {
  portfolioRows: ClientPortfolioLoad["rows"];
  portfolioDetails?: ClientPortfolioLoad["details"];
  defaultFilters?: Partial<DebtorsReportFilters>;
  hint?: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:bg-white"
        }
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      <DebtorsReportDialog
        open={open}
        onClose={() => setOpen(false)}
        portfolioRows={portfolioRows}
        portfolioDetails={portfolioDetails}
        defaultFilters={defaultFilters}
        hint={hint}
      />
    </>
  );
}
