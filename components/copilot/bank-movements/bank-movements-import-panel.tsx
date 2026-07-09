"use client";

import { useRef, useState } from "react";
import { ChevronDown, FileUp, Loader2 } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type {
  BulkConfirmData,
  BulkPreviewData,
  BulkPreviewReadyItem,
  CurrencyBulkTotals,
} from "@/lib/bank-movements/bank-movements-import-bulk";
import type { SantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";

const dateFormatter = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });

function formatPeriodDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatMoney(currency: string, value: number | null): string {
  if (value == null) return "—";
  return `${currency} ${numberFormatter.format(value)}`;
}

type PreviewResponse = { ok: true; data: BulkPreviewData } | { ok: false; error?: string };
type ConfirmResponse = { ok: true; data: BulkConfirmData } | { ok: false; error?: string };

type BankMovementsImportPanelProps = {
  onImportComplete?: () => void | Promise<void>;
  onGoToMovements?: () => void;
};

export function BankMovementsImportPanel({
  onImportComplete,
  onGoToMovements,
}: BankMovementsImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<BulkConfirmData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async () => {
    if (selectedFiles.length === 0) {
      setError("Elegí uno o más archivos PDF o Excel consolidado de Santander.");
      return;
    }
    setPreviewing(true);
    setError(null);
    setBulkPreview(null);
    setConfirmResult(null);
    try {
      const form = new FormData();
      for (const file of selectedFiles) {
        form.append("files", file);
      }
      const res = await fetch("/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as PreviewResponse;
      if (!res.ok || !json.ok || !json.data) {
        setError(
          json.ok === false
            ? (json.error ?? "No pudimos leer los extractos.")
            : "No pudimos leer los extractos."
        );
        return;
      }
      setBulkPreview(json.data);
    } catch {
      setError("No pudimos leer los extractos. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setPreviewing(false);
    }
  };

  const runConfirm = async () => {
    if (!bulkPreview || bulkPreview.previews.length === 0) return;
    setConfirming(true);
    setError(null);
    setConfirmResult(null);
    try {
      const previews = bulkPreview.previews.map((item) => ({
        file_name: item.file_name,
        preview: {
          bank_name: item.bank_name,
          account_number: item.account_number,
          currency_code: item.currency_code,
          period_start: item.period_start,
          period_end: item.period_end,
          opening_balance: item.opening_balance,
          closing_balance: item.closing_balance,
          movements: item.movements,
        },
      }));
      const res = await fetch("/api/copilot/bank-movements/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previews }),
      });
      const json = (await res.json()) as ConfirmResponse;
      if (!res.ok || !json.ok || !json.data) {
        setError(
          json.ok === false
            ? (json.error ?? "No se pudo confirmar la importación.")
            : "No se pudo confirmar la importación."
        );
        return;
      }
      setConfirmResult(json.data);
      await onImportComplete?.();
    } catch {
      setError("No se pudo confirmar la importación. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setConfirming(false);
    }
  };

  const readyCount = bulkPreview?.parsed_count ?? 0;
  const canConfirm = Boolean(bulkPreview && readyCount > 0 && !confirmResult);

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Importar extracto</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Podés seleccionar varios extractos PDF o Excel consolidado (.xlsx) a la vez. La vista previa no
        guarda nada en la base de datos.
      </p>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-[var(--copilot-border)] px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <FileUp className="h-6 w-6 shrink-0 text-[var(--copilot-muted)]" aria-hidden />
            <div>
              <p className="text-sm font-medium text-[var(--copilot-text)]">
                Banco: Santander (PDF o Excel consolidado)
              </p>
              <p className={copilotCaptionClass}>
                Cuentas UYU y USD con tabla de movimientos o hoja Movimientos consolidados.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setSelectedFiles(files);
                setBulkPreview(null);
                setConfirmResult(null);
                setError(null);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            >
              Elegir archivos
            </button>
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={selectedFiles.length === 0 || previewing}
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
            >
              {previewing ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Leyendo…
                </>
              ) : (
                "Previsualizar extractos"
              )}
            </button>
          </div>
        </div>

        {selectedFiles.length > 0 ? (
          <p className={copilotCaptionClass}>
            Archivos seleccionados:{" "}
            <span className="text-[var(--copilot-text)]">{selectedFiles.length}</span>
            <span className="mt-1 block truncate text-[var(--copilot-muted)]">
              {selectedFiles.map((f) => f.name).join(", ")}
            </span>
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
            {error}
          </p>
        ) : null}
      </div>

      {bulkPreview ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]">
            {confirmResult
              ? "Importación registrada. Los movimientos ya están disponibles en la pestaña Movimientos."
              : "Vista previa. Todavía no se guardó ningún movimiento."}
          </div>

          <BulkSummaryGrid preview={bulkPreview} />

          {bulkPreview.errors.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-danger-text-strong)]">
                Archivos con error
              </p>
              {bulkPreview.errors.map((item) => (
                <p
                  key={item.file_name}
                  className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]"
                >
                  <span className="font-medium">{item.file_name}:</span> {item.error}
                </p>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            {bulkPreview.previews.map((item) => (
              <PreviewFileCard key={item.client_preview_id} preview={item} />
            ))}
          </div>

          <div className="flex flex-col items-end gap-2">
            <p className={`${copilotCaptionClass} text-right`}>
              Esto guardará los movimientos en Banco. No se duplicarán movimientos ya importados.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {confirmResult && onGoToMovements ? (
                <button
                  type="button"
                  onClick={onGoToMovements}
                  className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                >
                  Ver movimientos
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void runConfirm()}
                disabled={confirming || !canConfirm}
                className={copilotButtonClassName({ variant: "primary", size: "sm" })}
              >
                {confirming ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                    Guardando…
                  </>
                ) : (
                  "Confirmar importación"
                )}
              </button>
            </div>
            {confirmResult ? (
              <ConfirmSummary result={confirmResult} />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BulkSummaryGrid({ preview }: { preview: BulkPreviewData }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryItem label="Archivos seleccionados" value={String(preview.files_count)} />
      <SummaryItem label="Archivos leídos" value={String(preview.parsed_count)} />
      <SummaryItem label="Archivos con error" value={String(preview.failed_count)} />
      <SummaryItem label="Total movimientos" value={String(preview.total_movements_count)} />
      <CurrencySummary label="Entradas UYU" currency="UYU" field="inflows" totals={preview.totals_by_currency.UYU} />
      <CurrencySummary label="Salidas UYU" currency="UYU" field="outflows" totals={preview.totals_by_currency.UYU} />
      <CurrencySummary label="Entradas USD" currency="USD" field="inflows" totals={preview.totals_by_currency.USD} />
      <CurrencySummary label="Salidas USD" currency="USD" field="outflows" totals={preview.totals_by_currency.USD} />
      <CurrencySummary label="Neto UYU" currency="UYU" field="net" totals={preview.totals_by_currency.UYU} />
      <CurrencySummary label="Neto USD" currency="USD" field="net" totals={preview.totals_by_currency.USD} />
    </div>
  );
}

function CurrencySummary({
  label,
  currency,
  field,
  totals,
}: {
  label: string;
  currency: string;
  field: keyof Pick<CurrencyBulkTotals, "inflows" | "outflows" | "net">;
  totals: CurrencyBulkTotals;
}) {
  return <SummaryItem label={label} value={formatMoney(currency, totals[field])} />;
}

function PreviewFileCard({ preview }: { preview: BulkPreviewReadyItem }) {
  const [open, setOpen] = useState(false);
  const subtitle = `${preview.currency_code} · ${preview.movements_count} movimientos · ${formatMoney(preview.currency_code, preview.totals.net)} neto`;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left sm:px-4"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="truncate text-sm font-medium text-[var(--copilot-text)]">{preview.file_name}</p>
            <p className={copilotCaptionClass}>{subtitle}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MiniSummary label="Banco" value={preview.bank_name} />
            <MiniSummary label="Cuenta" value={preview.account_number} />
            <MiniSummary label="Moneda" value={preview.currency_code} />
            <MiniSummary
              label="Período"
              value={`${formatPeriodDate(preview.period_start)} – ${formatPeriodDate(preview.period_end)}`}
            />
            <MiniSummary label="Entradas" value={formatMoney(preview.currency_code, preview.totals.inflows)} />
            <MiniSummary label="Salidas" value={formatMoney(preview.currency_code, preview.totals.outflows)} />
            <MiniSummary label="Neto" value={formatMoney(preview.currency_code, preview.totals.net)} />
            <MiniSummary label="Estado" value="Listo" />
          </div>
        </div>
        <ChevronDown
          aria-hidden
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--copilot-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t border-[var(--copilot-border)] px-3 pb-3 sm:px-4">
          <MovementsTable preview={preview} />
        </div>
      ) : null}
    </div>
  );
}

function MovementsTable({ preview }: { preview: SantanderBankStatementPreview }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-[var(--copilot-muted)]">
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Descripción</th>
            <th className="px-3 py-2">Referencia</th>
            <th className="px-3 py-2 text-right">Entrada</th>
            <th className="px-3 py-2 text-right">Salida</th>
            <th className="px-3 py-2 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {preview.movements.map((row, index) => (
            <tr
              key={`${row.date}-${row.reference ?? ""}-${index}`}
              className="border-t border-[var(--copilot-border)] align-top"
            >
              <td className="px-3 py-2 whitespace-nowrap">{formatPeriodDate(row.date)}</td>
              <td className="px-3 py-2">{row.description}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.reference ?? "—"}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {row.credit != null ? formatMoney(preview.currency_code, row.credit) : "—"}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {row.debit != null ? formatMoney(preview.currency_code, row.debit) : "—"}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {row.balance != null ? formatMoney(preview.currency_code, row.balance) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmSummary({ result }: { result: BulkConfirmData }) {
  const allDuplicate =
    result.inserted_count === 0 && result.skipped_duplicates_count > 0 && result.failed_files_count === 0;

  return (
    <div className="w-full space-y-2 text-right">
      <p className="text-xs text-[var(--copilot-success-text-strong)]">
        {allDuplicate
          ? "Estos extractos ya parecían importados. No se agregaron movimientos nuevos."
          : `Importación completada: ${result.inserted_count} movimientos nuevos, ${result.skipped_duplicates_count} duplicados omitidos.`}
      </p>
      {result.results.length > 0 ? (
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2 text-left">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Detalle por archivo
          </p>
          <ul className="space-y-1 text-xs text-[var(--copilot-text)]">
            {result.results.map((item) => (
              <li key={item.import_id} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                <span className="truncate font-medium">{item.file_name}</span>
                <span className="text-[var(--copilot-muted)]">
                  {item.inserted_count} nuevos · {item.skipped_duplicates_count} duplicados ·{" "}
                  {item.status === "duplicate" ? "Ya importado" : "Importado"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.errors.length > 0 ? (
        <div className="space-y-1 text-left">
          {result.errors.map((item) => (
            <p
              key={item.file_name}
              className="text-xs text-[var(--copilot-danger-text-strong)]"
            >
              {item.file_name}: {item.error}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-[var(--copilot-text)]">{value}</p>
    </div>
  );
}

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
        {label}
      </p>
      <p className="text-xs text-[var(--copilot-text)]">{value}</p>
    </div>
  );
}
