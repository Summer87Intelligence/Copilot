"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
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

type PreviewResponse =
  | { ok: true; data: SantanderBankStatementPreview }
  | { ok: false; error?: string };

export function BankMovementsImportPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<SantanderBankStatementPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async () => {
    if (!selectedFile) {
      setError("Elegí un archivo PDF de Santander.");
      return;
    }
    setPreviewing(true);
    setError(null);
    setPreview(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch("/api/copilot/bank-movements/imports/preview", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as PreviewResponse;
      if (!res.ok || !json.ok || !json.data) {
        setError(
          json.ok === false
            ? (json.error ?? "No pudimos leer el extracto.")
            : "No pudimos leer el extracto."
        );
        return;
      }
      setPreview(json.data);
    } catch {
      setError("No pudimos leer el extracto. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Importar extracto</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Subí un PDF de Santander para ver una vista previa. Todavía no se guarda nada en la base de
        datos.
      </p>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-[var(--copilot-border)] px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <FileUp className="h-6 w-6 shrink-0 text-[var(--copilot-muted)]" aria-hidden />
            <div>
              <p className="text-sm font-medium text-[var(--copilot-text)]">Banco: Santander (PDF)</p>
              <p className={copilotCaptionClass}>Cuentas UYU y USD con tabla de movimientos.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
                setPreview(null);
                setError(null);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            >
              Elegir PDF
            </button>
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={!selectedFile || previewing}
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
            >
              {previewing ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Leyendo…
                </>
              ) : (
                "Previsualizar extracto"
              )}
            </button>
          </div>
        </div>

        {selectedFile ? (
          <p className={copilotCaptionClass}>
            Archivo: <span className="text-[var(--copilot-text)]">{selectedFile.name}</span>
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
            {error}
          </p>
        ) : null}
      </div>

      {preview ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]">
            Vista previa. Todavía no se guardó ningún movimiento.
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryItem label="Banco" value={preview.bank_name} />
            <SummaryItem label="Cuenta" value={preview.account_number} />
            <SummaryItem label="Moneda" value={preview.currency_code} />
            <SummaryItem
              label="Período"
              value={`${formatPeriodDate(preview.period_start)} – ${formatPeriodDate(preview.period_end)}`}
            />
            <SummaryItem label="Movimientos" value={String(preview.movements_count)} />
            <SummaryItem
              label="Total entradas"
              value={formatMoney(preview.currency_code, preview.totals.inflows)}
            />
            <SummaryItem
              label="Total salidas"
              value={formatMoney(preview.currency_code, preview.totals.outflows)}
            />
            <SummaryItem
              label="Neto"
              value={formatMoney(preview.currency_code, preview.totals.net)}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
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
                      {row.credit != null
                        ? formatMoney(preview.currency_code, row.credit)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row.debit != null ? formatMoney(preview.currency_code, row.debit) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row.balance != null
                        ? formatMoney(preview.currency_code, row.balance)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled
              title="Guardar movimientos estará disponible en el próximo paso."
              className={copilotButtonClassName({ variant: "primary", size: "sm", className: "opacity-60" })}
            >
              Confirmar importación
            </button>
          </div>
          <p className={`${copilotCaptionClass} text-right`}>
            Guardar movimientos estará disponible en el próximo paso.
          </p>
        </div>
      ) : null}
    </section>
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
