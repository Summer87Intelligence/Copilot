"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown, Loader2, X } from "lucide-react";

import { CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { copilotApiFetch } from "@/lib/copilot-fetch";

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function nowYear() {
  return new Date().getFullYear();
}
function nowMonth() {
  return new Date().getMonth() + 1;
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CollectionsReportDialog({ open, onClose }: Props) {
  const [year, setYear] = useState<number>(nowYear);
  const [month, setMonth] = useState<number>(nowMonth);
  const [currency, setCurrency] = useState<"UYU" | "USD">("UYU");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setYear(nowYear());
    setMonth(nowMonth());
    setCurrency("UYU");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/copilot/reports/collections.pdf?year=${year}&month=${month}&currency=${currency}`;
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
      const mm = String(month).padStart(2, "0");
      a.href = objectUrl;
      a.download = match?.[1] ?? `cobranza-${year}-${mm}-${currency}.pdf`;
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
  }, [year, month, currency, onClose]);

  if (!open) return null;

  const yearOptions = Array.from(
    { length: Math.max(1, nowYear() - 2026 + 1) },
    (_, i) => 2026 + i
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collections-report-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <h2
              id="collections-report-title"
              className="text-base font-semibold text-[var(--copilot-ink)]"
            >
              Reporte de cobranza
            </h2>
            <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
              Cobros registrados del mes, separados por moneda.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-black/[0.04] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-[var(--copilot-ink-muted)]">
              Mes
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1.5 text-sm text-[var(--copilot-ink)]"
              >
                {MONTH_NAMES_ES.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--copilot-ink-muted)]">
              Año
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1.5 text-sm text-[var(--copilot-ink)]"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Moneda
            </p>
            <div className="mt-1.5 flex gap-2">
              {(["UYU", "USD"] as const).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setCurrency(cur)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    currency === cur
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                      : "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"
                  }`}
                >
                  {cur === "UYU" ? "Pesos (UYU)" : "Dólares (USD)"}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-sm text-[var(--copilot-danger-text-strong)]">
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
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
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

export function CollectionsReportTrigger({
  className = "",
  label = "Generar PDF",
}: {
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
          "inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:bg-[var(--copilot-panel-bg)]"
        }
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      <CollectionsReportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
