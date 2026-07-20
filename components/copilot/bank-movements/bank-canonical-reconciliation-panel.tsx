"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { HumanConfidenceLevel } from "@/lib/bank/canonical/reconciliation-confidence";

/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — bandeja diaria de Conciliación con
 * acciones reales. Lee ÚNICAMENTE `/api/copilot/bank-movements/canonical-suggestions`
 * (`suggestion_scope='operational'`). Confirmar/Rechazar llaman exclusivamente
 * a `/api/copilot/bank-reconciliation/[suggestionId]/confirm|reject`, que a su
 * vez delegan en `confirm_bank_reconciliation_v1` / `reject_bank_suggestion_v1`.
 * Este componente nunca escribe directo a ninguna tabla ni usa Motor C.
 *
 * La identificación automática de pagadores se habilitará en una fase posterior.
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

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function money(currency: string, amount: number): string {
  return `${currency} ${numberFormatter.format(amount)}`;
}

const CONFIDENCE_STYLES: Record<HumanConfidenceLevel, string> = {
  alta: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  media: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  baja: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]",
  sin_sugerencia: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-muted)]",
};

const PAGE_SIZE = 10;

type ActionOutcome = { kind: "confirmed" | "rejected"; idempotent: boolean };

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
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

export function BankCanonicalReconciliationPanel({
  initialMovementId = null,
  onInitialMovementConsumed,
}: {
  /** FASE BANK-CANONICAL-CONFIRM-UI-001: al llegar desde "Revisar conciliación" en Ingresos. */
  initialMovementId?: string | null;
  onInitialMovementConsumed?: () => void;
} = {}) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [mutating, setMutating] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [drawerSuggestionId, setDrawerSuggestionId] = useState<string | null>(null);
  const [rejectingSuggestionId, setRejectingSuggestionId] = useState<string | null>(null);
  const [movementFocusId, setMovementFocusId] = useState<string | null>(initialMovementId);
  const [confirmedToday, setConfirmedToday] = useState(0);

  useEffect(() => {
    if (initialMovementId) setMovementFocusId(initialMovementId);
  }, [initialMovementId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = movementFocusId
        ? `movementId=${encodeURIComponent(movementFocusId)}&limit=1`
        : `limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(`/api/copilot/bank-movements/canonical-suggestions?${query}`);
      const json = (await res.json()) as {
        ok: boolean;
        data?: EvidenceItem[];
        meta?: { total: number; confirmedToday?: number };
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo cargar la conciliación.");
        return;
      }
      setItems(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
      setConfirmedToday(json.meta?.confirmedToday ?? 0);
      setFocusIndex(0);
    } catch {
      setError("No se pudo cargar la conciliación.");
    } finally {
      setLoading(false);
    }
  }, [offset, movementFocusId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exitMovementFocus = useCallback(() => {
    setMovementFocusId(null);
    onInitialMovementConsumed?.();
  }, [onInitialMovementConsumed]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const goNextPending = useCallback(() => {
    if (focusIndex + 1 < items.length) {
      setFocusIndex((i) => i + 1);
    } else if (offset + PAGE_SIZE < total) {
      setOffset((o) => o + PAGE_SIZE);
    }
  }, [focusIndex, items.length, offset, total]);

  const removeItemLocally = useCallback(
    (suggestionId: string) => {
      // Si veníamos de "Revisar conciliación" en Ingresos (un solo movimiento foco),
      // al resolver el caso volvemos a la bandeja general en vez de quedar en un foco vacío.
      if (movementFocusId) {
        exitMovementFocus();
        return;
      }
      setItems((prev) => prev.filter((it) => it.suggestionId !== suggestionId));
      setTotal((t) => Math.max(0, t - 1));
      setFocusIndex((i) => Math.max(0, Math.min(i, items.length - 2)));
      // Si la página se vació pero quedan más casos en el total, recargar para traer la siguiente tanda.
      if (items.length <= 1 && offset + PAGE_SIZE < total) {
        void load();
      }
    },
    [items.length, offset, total, load, movementFocusId, exitMovementFocus]
  );

  const handleOutcome = useCallback(
    (suggestionId: string, outcome: ActionOutcome) => {
      setActionErrors((prev) => {
        const next = { ...prev };
        delete next[suggestionId];
        return next;
      });
      const verb = outcome.kind === "confirmed" ? "Conciliación confirmada" : "Sugerencia rechazada";
      const idem = outcome.idempotent ? " (ya estaba procesada)." : ".";
      setFeedback(`${verb}${idem}`);
      if (outcome.kind === "confirmed" && !outcome.idempotent) {
        setConfirmedToday((c) => c + 1);
      }
      removeItemLocally(suggestionId);
      setDrawerSuggestionId(null);
      setRejectingSuggestionId(null);
    },
    [removeItemLocally]
  );

  const confirmSuggestion = useCallback(
    async (item: EvidenceItem, invoiceAllocations: Array<{ invoiceId: string; amount: number }>) => {
      if (mutating[item.suggestionId]) return;
      setMutating((m) => ({ ...m, [item.suggestionId]: true }));
      setActionErrors((prev) => {
        const next = { ...prev };
        delete next[item.suggestionId];
        return next;
      });
      const result = await postJson(`/api/copilot/bank-reconciliation/${item.suggestionId}/confirm`, {
        expectedMovementId: item.movement.id,
        expectedReceiptId: item.receipt?.id ?? null,
        invoiceAllocations,
      });
      setMutating((m) => {
        const next = { ...m };
        delete next[item.suggestionId];
        return next;
      });
      if (!result.ok) {
        setActionErrors((prev) => ({ ...prev, [item.suggestionId]: result.error ?? "No se pudo confirmar." }));
        return;
      }
      const data = (result.data ?? {}) as { idempotent?: boolean };
      handleOutcome(item.suggestionId, { kind: "confirmed", idempotent: Boolean(data.idempotent) });
    },
    [mutating, handleOutcome]
  );

  const rejectSuggestion = useCallback(
    async (item: EvidenceItem, reason: string) => {
      if (mutating[item.suggestionId]) return;
      setMutating((m) => ({ ...m, [item.suggestionId]: true }));
      setActionErrors((prev) => {
        const next = { ...prev };
        delete next[item.suggestionId];
        return next;
      });
      const result = await postJson(`/api/copilot/bank-reconciliation/${item.suggestionId}/reject`, {
        expectedMovementId: item.movement.id,
        reason,
      });
      setMutating((m) => {
        const next = { ...m };
        delete next[item.suggestionId];
        return next;
      });
      if (!result.ok) {
        setActionErrors((prev) => ({ ...prev, [item.suggestionId]: result.error ?? "No se pudo rechazar." }));
        return;
      }
      const data = (result.data ?? {}) as { idempotent?: boolean };
      handleOutcome(item.suggestionId, { kind: "rejected", idempotent: Boolean(data.idempotent) });
    },
    [mutating, handleOutcome]
  );

  const currentItem = items[focusIndex] ?? null;
  const drawerItem = useMemo(
    () => items.find((it) => it.suggestionId === drawerSuggestionId) ?? null,
    [items, drawerSuggestionId]
  );

  return (
    <div className="space-y-4">
      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Conciliación</h2>
        <p className={`${copilotCaptionClass} mt-1`}>
          Revisá cada ingreso con su cliente, recibo y facturas propuestos. Esta bandeja usa únicamente el motor
          canónico de conciliación — nunca mezcla histórico ni auditoría.
        </p>
      </section>

      {movementFocusId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2 text-xs text-[var(--copilot-text)]">
          <span>Mostrando la conciliación de un movimiento puntual (abierto desde Ingresos).</span>
          <button type="button" onClick={exitMovementFocus} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Volver a todos los pendientes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className={copilotCardStandardClass}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Pendientes</p>
            <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{loading ? "…" : total}</p>
          </div>
          <div className={copilotCardStandardClass}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Coincidencia alta</p>
            <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">
              {loading ? "…" : items.filter((i) => i.confidenceLevel === "alta").length}
            </p>
          </div>
          <div className={copilotCardStandardClass}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Requieren revisión</p>
            <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">
              {loading ? "…" : items.filter((i) => i.confidenceLevel === "media" || i.confidenceLevel === "baja").length}
            </p>
          </div>
          <div className={copilotCardStandardClass}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Sin sugerencia</p>
            <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">
              {loading ? "…" : items.filter((i) => i.confidenceLevel === "sin_sugerencia").length}
            </p>
          </div>
          <div className={copilotCardStandardClass}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Conciliados hoy</p>
            <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{loading ? "…" : confirmedToday}</p>
          </div>
        </div>
      )}

      {feedback ? (
        <p className="rounded-lg border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-3 py-2 text-xs text-[var(--copilot-success-text-strong)]">
          {feedback}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Cargando sugerencias…
        </div>
      ) : items.length === 0 ? (
        <section className={copilotCardStandardClass}>
          <p className={copilotCaptionClass}>
            {movementFocusId
              ? "Este movimiento no tiene una sugerencia operativa de conciliación pendiente."
              : "No hay sugerencias operativas pendientes todavía. El motor canónico genera sugerencias en segundo plano; si esperabas ver casos acá, confirmá que el proceso de generación ya corrió para este workspace."}
          </p>
        </section>
      ) : currentItem ? (
        <>
          {!movementFocusId ? (
            <p className={copilotCaptionClass}>Caso {focusIndex + 1} de {items.length} en esta página · {total} en total.</p>
          ) : null}
          <EvidenceCard
            item={currentItem}
            mutating={Boolean(mutating[currentItem.suggestionId])}
            actionError={actionErrors[currentItem.suggestionId] ?? null}
            isRejecting={rejectingSuggestionId === currentItem.suggestionId}
            onNext={goNextPending}
            onQuickConfirm={() => void confirmSuggestion(currentItem, [])}
            onOpenDrawer={() => setDrawerSuggestionId(currentItem.suggestionId)}
            onStartReject={() => setRejectingSuggestionId(currentItem.suggestionId)}
            onCancelReject={() => setRejectingSuggestionId(null)}
            onSubmitReject={(reason) => void rejectSuggestion(currentItem, reason)}
          />
        </>
      ) : null}

      {drawerItem ? (
        <EvidenceDrawer
          item={drawerItem}
          mutating={Boolean(mutating[drawerItem.suggestionId])}
          actionError={actionErrors[drawerItem.suggestionId] ?? null}
          onClose={() => setDrawerSuggestionId(null)}
          onConfirm={(allocations) => void confirmSuggestion(drawerItem, allocations)}
          onReject={(reason) => void rejectSuggestion(drawerItem, reason)}
        />
      ) : null}
    </div>
  );
}

function EvidenceSummary({ item }: { item: EvidenceItem }) {
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

function EvidenceCard({
  item,
  mutating,
  actionError,
  isRejecting,
  onNext,
  onQuickConfirm,
  onOpenDrawer,
  onStartReject,
  onCancelReject,
  onSubmitReject,
}: {
  item: EvidenceItem;
  mutating: boolean;
  actionError: string | null;
  isRejecting: boolean;
  onNext: () => void;
  onQuickConfirm: () => void;
  onOpenDrawer: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onSubmitReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const canQuickConfirm =
    Boolean(item.receipt) && item.confidenceLevel === "alta" && !item.payer?.hasConflict;

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--copilot-border)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--copilot-text)]">
          {item.client ? `Posible pago de ${item.client.name}` : "Ingreso sin cliente sugerido"}
        </p>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLES[item.confidenceLevel]}`}
        >
          Coincidencia: {item.confidenceLabel}
        </span>
      </div>

      <EvidenceSummary item={item} />

      {item.reasons.length > 0 || item.warnings.length > 0 ? (
        <div className="border-t border-[var(--copilot-border)] px-4 py-3">
          {item.reasons.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-[var(--copilot-text)]">
              {item.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          ) : null}
          {item.warnings.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs text-[var(--copilot-warning-text-strong)]">
              {item.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {item.payer?.hasConflict ? (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Esta cuenta está vinculada a más de un cliente. No se confirma automáticamente — requiere revisión.</span>
        </div>
      ) : null}

      {actionError ? (
        <p className="mx-4 mb-3 rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
          {actionError}
        </p>
      ) : null}

      {isRejecting ? (
        <div className="mx-4 mb-3 space-y-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
          <label className="block text-xs font-medium text-[var(--copilot-text)]" htmlFor={`reject-reason-${item.suggestionId}`}>
            ¿Por qué esta sugerencia no es correcta?
          </label>
          <textarea
            id={`reject-reason-${item.suggestionId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
            placeholder="Ej: el pagador no es este cliente"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelReject}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              disabled={mutating}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSubmitReject(reason)}
              disabled={mutating || reason.trim().length < 3}
              className={copilotButtonClassName({ variant: "danger", size: "sm" })}
            >
              {mutating ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--copilot-border)] px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {canQuickConfirm ? (
            <button
              type="button"
              onClick={onQuickConfirm}
              disabled={mutating}
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
            >
              {mutating ? "Confirmando…" : "Confirmar"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenDrawer}
            disabled={mutating}
            className={copilotButtonClassName({ variant: canQuickConfirm ? "ghost" : "primary", size: "sm" })}
          >
            Revisar evidencia
          </button>
          {!isRejecting ? (
            <button
              type="button"
              onClick={onStartReject}
              disabled={mutating}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            >
              Rechazar
            </button>
          ) : null}
        </div>
        <button type="button" onClick={onNext} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
          Siguiente pendiente
        </button>
      </div>
    </article>
  );
}

function EvidenceDrawer({
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
          {!showReject ? (
            <button type="button" onClick={() => setShowReject(true)} disabled={mutating} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              Rechazar sugerencia
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onConfirm(allocations)}
            disabled={mutating || overAllocated}
            className={copilotButtonClassName({ variant: "primary", size: "sm" })}
          >
            {mutating ? "Confirmando…" : allocations.length > 0 ? "Confirmar con estas facturas" : "Confirmar conciliación"}
          </button>
        </div>
      </div>
    </div>
  );
}
