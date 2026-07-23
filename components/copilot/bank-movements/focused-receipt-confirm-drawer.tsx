"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BankDrawerBody,
  BankDrawerHeader,
  BankDrawerShell,
} from "@/components/copilot/bank-movements/bank-drawer-shell";
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

/** Estado explícito de carga — nunca afirmar "falta recibo" mientras loading. */
export type FocusedReceiptDrawerLoadState = "loading" | "ready" | "empty" | "error";

/**
 * FASE BANK-END-TO-END-RECONCILIATION-FLOW-UX-CORRECTION-001 —
 * Confirmar con recibo abre SOLO el movimiento pedido. Nunca la bandeja
 * general de pendientes (BankIncomeWorkspace).
 *
 * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — estados explícitos
 * loading|ready|empty|error. Mientras `loading`, nunca se afirma "falta
 * recibo" ni "no hay recibo": el mensaje es siempre "Cargando evidencia…".
 * Si el cluster de pagador (motor B) ya vio un recibo compatible para este
 * cliente (`expectedHasCompatibleReceipt`) pero la evidencia canónica (motor
 * D) todavía no expone una sugerencia lista para confirmar, el mensaje lo
 * dice explícitamente en vez de mentir "falta recibo en Zeta" — ofrece
 * "Revisá opciones" (retry) en su lugar.
 */
export function FocusedReceiptConfirmDrawer({
  movementId,
  onClose,
  onChanged,
  expectedHasCompatibleReceipt = false,
  clientLabel,
}: {
  movementId: string;
  onClose: () => void;
  onChanged?: () => void;
  /** El cluster de pagador ya vio un recibo compatible para este cliente/moneda/monto. */
  expectedHasCompatibleReceipt?: boolean;
  /** Nombre de cliente ya identificado (si lo hay), solo para contexto visual. */
  clientLabel?: string;
}) {
  const [state, setState] = useState<FocusedReceiptDrawerLoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState<IncomeWorkspaceRowDTO | null>(null);
  const [mutating, setMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(
        `/api/copilot/bank-movements/canonical-suggestions?workspace=income&movementIds=${encodeURIComponent(movementId)}`
      );
      if (res.status === 404) {
        setRow(null);
        setError("No encontramos este movimiento.");
        setState("error");
        return;
      }
      if (!res.ok) {
        setRow(null);
        setError(
          res.status >= 500 ? "Error del servidor al cargar la evidencia." : "No se pudo cargar este movimiento."
        );
        setState("error");
        return;
      }
      const json = (await res.json()) as { ok?: boolean; data?: IncomeWorkspaceRowDTO[]; error?: string };
      if (!json.ok) {
        setRow(null);
        setError(json.error ?? "No se pudo cargar este movimiento.");
        setState("error");
        return;
      }
      const nextRow = json.data?.[0] ?? null;
      setRow(nextRow);
      if (!nextRow) {
        setError("No encontramos este movimiento.");
        setState("error");
        return;
      }
      setState(nextRow.evidence ? "ready" : "empty");
    } catch {
      setRow(null);
      setError("No se pudo conectar con el servidor.");
      setState("error");
    }
  }, [movementId]);

  useEffect(() => {
    // Fetch-on-open: el estado se sincroniza desde una fuente externa (API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Estado `ready` con evidencia: delega en el drawer canónico compartido.
  // `ReconciliationEvidenceDrawer.canConfirm` ya exige `item.receipt != null`
  // — nunca ofrece "Confirmar" sin un receipt_id concreto.
  if (state === "ready" && row?.evidence) {
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
      <BankDrawerHeader className="flex items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Confirmar con recibo</h3>
        <button type="button" onClick={onClose} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
          Cerrar
        </button>
      </BankDrawerHeader>
      <BankDrawerBody className="space-y-3 p-4">
        {clientLabel ? <p className={copilotCaptionClass}>Cliente: {clientLabel}</p> : null}

        {/* Nunca afirmar falta/no hay recibo mientras carga. */}
        {state === "loading" ? <p className={copilotCaptionClass}>Cargando evidencia…</p> : null}

        {state === "error" ? (
          <>
            <p className="text-sm text-[var(--copilot-danger-text-strong)]">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            >
              Reintentar
            </button>
          </>
        ) : null}

        {state === "empty" && row ? (
          <>
            <p className="text-sm font-medium text-[var(--copilot-text)]">
              {row.movement.currency}{" "}
              {row.movement.amount.toLocaleString("es-UY", { minimumFractionDigits: 2 })} · {row.movement.date.slice(0, 10)}
            </p>
            <p className={copilotCaptionClass}>{row.movement.descriptionMasked}</p>
            {expectedHasCompatibleReceipt ? (
              <>
                <p className="rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-sm text-[var(--copilot-warning-text-strong)]">
                  Vimos un recibo compatible para este cliente, pero la sugerencia canónica todavía no está lista para
                  confirmar acá. Revisá las opciones o intentá de nuevo en unos segundos.
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  Revisá opciones
                </button>
              </>
            ) : (
              <p className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2 text-sm text-[var(--copilot-text)]">
                Falta recibo en Zeta. Todavía no encontramos un recibo compatible con este movimiento — dejalo
                pendiente hasta que aparezca.
              </p>
            )}
          </>
        ) : null}
      </BankDrawerBody>
    </BankDrawerShell>
  );
}
