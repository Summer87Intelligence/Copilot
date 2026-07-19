"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import type { BankReviewRow } from "@/lib/bank/review/bank-review-view";
import {
  ActionChip,
  ConfidenceChip,
  HistoricalBadges,
  KeyValue,
  ReasonPills,
} from "@/components/copilot/bank-review/bank-review-badges";

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function YesNo({ value }: { value: boolean }) {
  return <span className="font-semibold">{value ? "Sí" : "No"}</span>;
}

const ACTION_BTN =
  "inline-flex h-9 items-center justify-center rounded-lg border border-[var(--copilot-border)] px-3 text-xs font-semibold text-[var(--copilot-ink)] transition enabled:hover:bg-[var(--copilot-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45";

export function BankReviewDrawer({
  row,
  onClose,
}: {
  row: BankReviewRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (row) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;
  const isHistorical = row.suggestionScope === "historical_review";

  function copyIds() {
    const text = [
      `movement:${row!.bankMovementId}`,
      row!.proposedReceiptId ? `receipt:${row!.proposedReceiptId}` : null,
      row!.proposedClientId ? `client:${row!.proposedClientId}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard?.writeText(text);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalle de sugerencia">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {isHistorical ? "Historical Review" : "Operational"}
            </p>
            <p className="text-base font-semibold text-[var(--copilot-ink)]">
              {fmtAmount(row.movement.amount, row.movement.currency)}
            </p>
            {isHistorical ? <HistoricalBadges /> : null}
          </div>
          <button type="button" onClick={onClose} className={ACTION_BTN} aria-label="Cerrar panel">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-4 py-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Movimiento
            </h3>
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Fecha">{row.movement.date}</KeyValue>
              <KeyValue label="Importe">{fmtAmount(row.movement.amount, row.movement.currency)}</KeyValue>
              <KeyValue label="Moneda">{row.movement.currency}</KeyValue>
              <KeyValue label="Dirección">{row.movement.direction}</KeyValue>
              <KeyValue label="Descripción">{row.movement.descriptionMasked}</KeyValue>
              <KeyValue label="Fingerprint">
                <code className="text-xs">{row.movement.payerFingerprintShort}…</code>
              </KeyValue>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Sugerencia
            </h3>
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Cliente propuesto">
                {row.clientName ?? (row.clientIdShort ? `${row.clientIdShort}…` : "—")}
              </KeyValue>
              <KeyValue label="Recibo propuesto">
                {row.receiptIdShort ? `${row.receiptIdShort}…` : "—"}
              </KeyValue>
              <KeyValue label="Confidence">
                <ConfidenceChip value={row.confidence} />
              </KeyValue>
              <KeyValue label="Acción sugerida">
                <ActionChip action={row.recommendedAction} />
              </KeyValue>
              <KeyValue label="Engine version">{row.engineVersion}</KeyValue>
              <KeyValue label="Suggestion scope">{row.suggestionScope}</KeyValue>
              <KeyValue label="Status">{row.status}</KeyValue>
              <KeyValue label="Historical audit"><YesNo value={row.evidence.historicalAudit} /></KeyValue>
              <KeyValue label="Audit only"><YesNo value={row.evidence.auditOnly} /></KeyValue>
            </dl>
            <div className="mt-3 flex flex-col gap-2">
              <KeyValue label="Reasons"><ReasonPills reasons={row.reasons} /></KeyValue>
              <KeyValue label="Warnings"><ReasonPills reasons={row.warnings} /></KeyValue>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Matching Evidence
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between gap-2"><span>Exact Amount</span><YesNo value={row.evidence.exactAmount} /></div>
              <div className="flex justify-between gap-2">
                <span>Date Proximity</span>
                <span className="font-semibold tabular-nums">
                  {row.evidence.dateProximityDays == null ? "—" : `${row.evidence.dateProximityDays} d`}
                </span>
              </div>
              <div className="flex justify-between gap-2"><span>Receipt Date Dominance</span><YesNo value={row.evidence.receiptDateDominance} /></div>
              <div className="flex justify-between gap-2"><span>Multiple Candidates</span><YesNo value={row.evidence.multipleCandidates} /></div>
              <div className="flex justify-between gap-2"><span>Historical Audit</span><YesNo value={row.evidence.historicalAudit} /></div>
              <div className="flex justify-between gap-2"><span>Audit Only</span><YesNo value={row.evidence.auditOnly} /></div>
              <div className="col-span-2 flex justify-between gap-2 border-t border-[var(--copilot-border)] pt-2">
                <span>Suggested Action</span><span className="font-semibold">{row.evidence.suggestedAction}</span>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Acciones
            </h3>
            {isHistorical ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ACTION_BTN} disabled title="Próximamente">Marcar revisada</button>
                <button type="button" className={ACTION_BTN} disabled title="Próximamente">Agregar nota</button>
                <button type="button" className={ACTION_BTN} disabled title="Próximamente">Rechazar sugerencia</button>
                <button type="button" className={ACTION_BTN} onClick={copyIds}>Copiar IDs</button>
                <button type="button" className={ACTION_BTN} disabled title="Próximamente">Ver evidencia</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ACTION_BTN} disabled title="Próximamente">Confirmar</button>
                <button type="button" className={ACTION_BTN} disabled title="Próximamente">Rechazar</button>
                <button type="button" className={ACTION_BTN} onClick={copyIds}>Copiar IDs</button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
              {isHistorical
                ? "Revisión histórica (audit-only): nunca concilia ni ejecuta AUTO. Acciones de conciliación deshabilitadas en esta fase."
                : "La confirmación de conciliación se hará por RPC financiera en una fase posterior."}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
