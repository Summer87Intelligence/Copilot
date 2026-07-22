"use client";

import { useCallback, useEffect, useState } from "react";

import { BankDrawerShell } from "@/components/copilot/bank-movements/bank-drawer-shell";
import {
  ReconciliationEvidenceDrawer,
  confirmCanonicalEvidence,
  rejectCanonicalEvidence,
  type ConfirmDrawerInput,
  type EvidenceItem,
} from "@/components/copilot/bank-movements/canonical-evidence-ui";
import { InlineErrorBoundary } from "@/components/copilot/ui/inline-error-boundary";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";

type IncomeWorkspaceRowDTO = {
  movement: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    descriptionMasked: string;
    accountLabel: string | null;
  };
  evidence: EvidenceItem | null;
};

/**
 * FASE BANK-END-TO-END-RECONCILIATION-FLOW-UX-CORRECTION-001 —
 * Confirmar con recibo abre SOLO el movimiento pedido. Nunca la bandeja
 * general de pendientes (BankIncomeWorkspace).
 */
export function FocusedReceiptConfirmDrawer({
  movementId,
  onClose,
  onChanged,
}: {
  movementId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState<IncomeWorkspaceRowDTO | null>(null);
  const [mutating, setMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/copilot/bank-movements/canonical-suggestions?workspace=income&movementIds=${encodeURIComponent(movementId)}`
      );
      if (res.status === 404) {
        setError("No encontramos este movimiento.");
        setRow(null);
        return;
      }
      if (!res.ok) {
        setError(res.status >= 500 ? "Error del servidor al cargar la evidencia." : "No se pudo cargar este movimiento.");
        setRow(null);
        return;
      }
      const json = (await res.json()) as { ok?: boolean; data?: IncomeWorkspaceRowDTO[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "No se pudo cargar este movimiento.");
        setRow(null);
        return;
      }
      setRow(json.data?.[0] ?? null);
    } catch {
      setError("No se pudo conectar con el servidor.");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [movementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = async (item: EvidenceItem, input: ConfirmDrawerInput) => {
    setMutating(true);
    setActionError(null);
    const result = await confirmCanonicalEvidence(item, input);
    setMutating(false);
    if (!result.ok) {
      setActionError(result.error ?? "No se pudo confirmar.");
      return;
    }
    onChanged?.();
    onClose();
  };

  const handleReject = async (item: EvidenceItem, reason: string) => {
    setMutating(true);
    setActionError(null);
    const result = await rejectCanonicalEvidence(item, reason);
    setMutating(false);
    if (!result.ok) {
      setActionError(result.error ?? "No se pudo rechazar.");
      return;
    }
    onChanged?.();
    onClose();
  };

  if (row?.evidence) {
    return (
      <InlineErrorBoundary fallbackMessage="No se pudo mostrar la evidencia." onError={onClose}>
        <ReconciliationEvidenceDrawer
          item={row.evidence}
          mutating={mutating}
          actionError={actionError}
          confirmLabel="Confirmar con recibo"
          onClose={onClose}
          onConfirm={(input) => void handleConfirm(row.evidence!, input)}
          onReject={(reason) => void handleReject(row.evidence!, reason)}
        />
      </InlineErrorBoundary>
    );
  }

  return (
    <BankDrawerShell onBackdropClick={onClose} panelClassName="w-full max-w-lg" aria-label="Confirmar movimiento">
      <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Confirmar con recibo</h3>
        <button type="button" onClick={onClose} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
          Cerrar
        </button>
      </div>
      <div className="space-y-3 p-4">
        {loading ? <p className={copilotCaptionClass}>Cargando movimiento…</p> : null}
        {error ? <p className="text-sm text-[var(--copilot-danger-text-strong)]">{error}</p> : null}
        {!loading && !error && row ? (
          <>
            <p className="text-sm font-medium text-[var(--copilot-text)]">
              {row.movement.currency}{" "}
              {row.movement.amount.toLocaleString("es-UY", { minimumFractionDigits: 2 })} · {row.movement.date.slice(0, 10)}
            </p>
            <p className={copilotCaptionClass}>{row.movement.descriptionMasked}</p>
            <p className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2 text-sm text-[var(--copilot-text)]">
              Todavía no hay un recibo compatible listo para confirmar en este movimiento. Revisá el detalle del cliente o
              dejalo pendiente.
            </p>
          </>
        ) : null}
        {!loading && !error && !row ? (
          <p className="text-sm text-[var(--copilot-danger-text-strong)]">No encontramos este movimiento.</p>
        ) : null}
      </div>
    </BankDrawerShell>
  );
}
