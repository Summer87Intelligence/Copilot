"use client";

import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";
import type { HumanConfidenceLevel } from "@/lib/bank/canonical/reconciliation-confidence";

/**
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 — piezas de evidencia y
 * confirmación/rechazo canónicas, extraídas de la extinta pestaña Conciliación
 * independiente (BANK-CANONICAL-CONFIRM-UI-001) para reusarlas dentro de la
 * bandeja unificada de Ingresos. Sin lógica nueva de escritura: siguen llamando
 * exclusivamente `/api/copilot/bank-reconciliation/[suggestionId]/confirm|reject`.
 */
export type EvidenceItem = {
  suggestionId: string;
  status: string;
  confidenceScore: number;
  confidenceLevel: HumanConfidenceLevel;
  confidenceLabel: string;
  reasons: string[];
  warnings: string[];
  movement: { id: string; date: string; amount: number; currency: string; descriptionMasked: string; accountLabel: string | null };
  payer: {
    identityId: string | null;
    maskedAccount: string | null;
    normalizedName: string | null;
    knownClientLinks: Array<{ clientId: string; confirmations: number; status: string }>;
    hasConflict: boolean;
  } | null;
  client: { id: string; name: string } | null;
  receipt: { id: string; amount: number; currency: string; date: string; status: string | null } | null;
  candidateInvoices: Array<{ invoiceId: string; balanceAmount: number; currencyCode: string; issueDate: string | null; dueDate: string | null }>;
};

const dateFormatter = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function money(currency: string, amount: number): string {
  return `${currency} ${numberFormatter.format(amount)}`;
}

export const CONFIDENCE_STYLES: Record<HumanConfidenceLevel, string> = {
  alta: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  media: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  baja: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]",
  sin_sugerencia: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-muted)]",
};

export type ActionOutcome = { kind: "confirmed" | "rejected"; idempotent: boolean };

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; error?: string; data?: unknown };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? "No se pudo completar la acción." };
    }
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor. Intentá de nuevo." };
  }
}

/** Confirma exclusivamente vía el endpoint canónico — nunca escribe directo, nunca usa Motor C. */
export async function confirmCanonicalEvidence(
  item: EvidenceItem,
  invoiceAllocations: Array<{ invoiceId: string; amount: number }>
): Promise<{ ok: boolean; error?: string; idempotent?: boolean }> {
  const result = await postJson(`/api/copilot/bank-reconciliation/${item.suggestionId}/confirm`, {
    expectedMovementId: item.movement.id,
    expectedReceiptId: item.receipt?.id ?? null,
    invoiceAllocations,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const data = (result.data ?? {}) as { idempotent?: boolean };
  return { ok: true, idempotent: Boolean(data.idempotent) };
}

/** Rechaza exclusivamente vía el endpoint canónico. Nunca ignora/archiva el movimiento. */
export async function rejectCanonicalEvidence(
  item: EvidenceItem,
  reason: string
): Promise<{ ok: boolean; error?: string; idempotent?: boolean }> {
  const result = await postJson(`/api/copilot/bank-reconciliation/${item.suggestionId}/reject`, {
    expectedMovementId: item.movement.id,
    reason,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const data = (result.data ?? {}) as { idempotent?: boolean };
  return { ok: true, idempotent: Boolean(data.idempotent) };
}

export function EvidenceSummary({ item }: { item: EvidenceItem }) {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Ingreso</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-text)]">
          {money(item.movement.currency, item.movement.amount)}
        </p>
        <p className={copilotCaptionClass}>{formatDate(item.movement.date)}</p>
        <p className={`${copilotCaptionClass} mt-1`}>{item.movement.descriptionMasked}</p>
        {item.payer?.maskedAccount ? <p className={copilotCaptionClass}>Cuenta: {item.payer.maskedAccount}</p> : null}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Recibo</p>
        {item.receipt ? (
          <>
            <p className="mt-1 text-sm font-medium text-[var(--copilot-text)]">
              {money(item.receipt.currency, item.receipt.amount)}
            </p>
            <p className={copilotCaptionClass}>{formatDate(item.receipt.date)}</p>
            <p className={copilotCaptionClass}>Estado: {item.receipt.status ?? "—"}</p>
          </>
        ) : (
          <p className={`${copilotCaptionClass} mt-1`}>Sin recibo propuesto.</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
          Facturas candidatas del cliente
        </p>
        {item.candidateInvoices.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {item.candidateInvoices.slice(0, 3).map((inv) => (
              <li key={inv.invoiceId} className={copilotCaptionClass}>
                Saldo {money(inv.currencyCode, inv.balanceAmount)} · vence {formatDate(inv.dueDate)}
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${copilotCaptionClass} mt-1`}>Sin facturas abiertas para este cliente/moneda.</p>
        )}
      </div>
    </div>
  );
}

export function ConfidenceBadge({ item }: { item: EvidenceItem }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLES[item.confidenceLevel]}`}
    >
      Coincidencia: {item.confidenceLabel}
    </span>
  );
}

export function ConflictWarning() {
  return (
    <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Esta cuenta está vinculada a más de un cliente. No se confirma automáticamente — requiere revisión.</span>
    </div>
  );
}

export function ReconciliationEvidenceDrawer({
  item,
  mutating,
  actionError,
  onClose,
  onConfirm,
  onReject,
}: {
  item: EvidenceItem;
  mutating: boolean;
  actionError: string | null;
  onClose: () => void;
  onConfirm: (allocations: Array<{ invoiceId: string; amount: number }>) => void;
  onReject: (reason: string) => void;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const toggleInvoice = (invoiceId: string, balanceAmount: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (invoiceId in next) {
        delete next[invoiceId];
      } else {
        next[invoiceId] = balanceAmount;
      }
      return next;
    });
  };

  const allocations = Object.entries(selected).map(([invoiceId, amount]) => ({ invoiceId, amount }));
  const allocatedTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
  const receiptAmount = item.receipt?.amount ?? 0;
  const overAllocated = item.receipt != null && allocatedTotal > receiptAmount;
  const isTerminal = item.status === "confirmed" || item.status === "rejected";
  // Sin recibo propuesto, confirm_bank_reconciliation_v1 no tiene qué vincular — el contrato
  // actual no soporta este caso (sección 15: nunca permitir Confirmar si la RPC no lo soporta).
  const canConfirm = !isTerminal && item.receipt != null && !overAllocated;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Evidencia de conciliación</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-[var(--copilot-soft-bg)]" aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <EvidenceSummary item={item} />

        {item.payer ? (
          <div className="mx-4 mb-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3 text-xs text-[var(--copilot-text)]">
            <p className="font-medium">Pagador</p>
            <p className={copilotCaptionClass}>{item.payer.normalizedName ?? "Sin nombre normalizado"}</p>
            {item.payer.knownClientLinks.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {item.payer.knownClientLinks.map((l) => (
                  <li key={l.clientId} className={copilotCaptionClass}>
                    Vinculado a cliente {l.clientId} · {l.confirmations} confirmaciones · {l.status}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className={`${copilotCaptionClass} mt-2 italic`}>
              La identificación automática de pagadores se habilitará en una fase posterior.
            </p>
          </div>
        ) : null}

        {item.candidateInvoices.length > 0 && item.receipt ? (
          <div className="mx-4 mb-3 space-y-2">
            <p className="text-xs font-medium text-[var(--copilot-text)]">
              Seleccioná las facturas a aplicar (opcional — si no seleccionás ninguna, se confirma solo el recibo).
            </p>
            <ul className="space-y-1">
              {item.candidateInvoices.map((inv) => (
                <li key={inv.invoiceId} className="flex items-center gap-2 text-xs text-[var(--copilot-text)]">
                  <input
                    type="checkbox"
                    checked={inv.invoiceId in selected}
                    onChange={() => toggleInvoice(inv.invoiceId, inv.balanceAmount)}
                  />
                  <span className="flex-1">
                    Saldo {money(inv.currencyCode, inv.balanceAmount)} · vence {formatDate(inv.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
            {allocations.length > 0 ? (
              <p className={`${copilotCaptionClass} ${overAllocated ? "text-[var(--copilot-danger-text-strong)]" : ""}`}>
                Total seleccionado: {money(item.receipt.currency, allocatedTotal)} de {money(item.receipt.currency, receiptAmount)}
                {overAllocated ? " — supera el importe del recibo." : ""}
              </p>
            ) : null}
          </div>
        ) : null}

        {!isTerminal && item.receipt == null ? (
          <p className="mx-4 mb-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2 text-xs text-[var(--copilot-text)]">
            Este caso requiere revisión manual y todavía no puede confirmarse desde Copilot: no hay un recibo
            propuesto para vincular.
          </p>
        ) : null}

        {actionError ? (
          <p className="mx-4 mb-3 rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
            {actionError}
          </p>
        ) : null}

        {showReject ? (
          <div className="mx-4 mb-3 space-y-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
            <label className="block text-xs font-medium text-[var(--copilot-text)]" htmlFor={`drawer-reject-${item.suggestionId}`}>
              ¿Por qué esta sugerencia no es correcta?
            </label>
            <textarea
              id={`drawer-reject-${item.suggestionId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowReject(false)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onReject(reason)}
                disabled={mutating || reason.trim().length < 3}
                className={copilotButtonClassName({ variant: "danger", size: "sm" })}
              >
                {mutating ? "Rechazando…" : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--copilot-border)] px-4 py-3">
          {!showReject && !isTerminal ? (
            <button type="button" onClick={() => setShowReject(true)} disabled={mutating} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              Rechazar sugerencia
            </button>
          ) : (
            <span />
          )}
          {!isTerminal ? (
            <button
              type="button"
              onClick={() => onConfirm(allocations)}
              disabled={mutating || !canConfirm}
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
            >
              {mutating ? "Confirmando…" : allocations.length > 0 ? "Confirmar con estas facturas" : "Confirmar conciliación"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
