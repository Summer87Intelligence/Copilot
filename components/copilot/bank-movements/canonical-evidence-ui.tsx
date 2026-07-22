"use client";

import { useEffect, useMemo, useState } from "react";
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
  /** Solo poblado para status==='confirmed': aplicaciones reales, no candidatas. */
  appliedAllocations: Array<{ invoiceId: string; invoiceNumber: string | null; appliedAmount: number; currencyCode: string }>;
  reconciliationLevel: "reconciled_with_receipt" | "full_reconciliation" | null;
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

/**
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — entrada única de confirmación,
 * cubre tanto "usar la coincidencia propuesta" (mode='suggested') como
 * "confirmar una selección manual revisada" (mode='manual_reviewed').
 */
export type ConfirmDrawerInput = {
  mode: "suggested" | "manual_reviewed";
  selectedClientId: string | null;
  selectedReceiptId: string | null;
  invoiceAllocations: Array<{ invoiceId: string; amount: number }>;
  manualReason: string | null;
};

/** Confirma exclusivamente vía el endpoint canónico — nunca escribe directo, nunca usa Motor C. */
export async function confirmCanonicalEvidence(
  item: EvidenceItem,
  input: ConfirmDrawerInput
): Promise<{ ok: boolean; error?: string; idempotent?: boolean }> {
  const result = await postJson(`/api/copilot/bank-reconciliation/${item.suggestionId}/confirm`, {
    expectedMovementId: item.movement.id,
    mode: input.mode,
    selectedClientId: input.selectedClientId,
    selectedReceiptId: input.selectedReceiptId,
    invoiceAllocations: input.invoiceAllocations,
    manualReason: input.manualReason,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const data = (result.data ?? {}) as { idempotent?: boolean };
  return { ok: true, idempotent: Boolean(data.idempotent) };
}

/** Construye el input de confirmación "usar la coincidencia propuesta" (mode='suggested'). */
export function suggestedConfirmInput(
  item: EvidenceItem,
  invoiceAllocations: Array<{ invoiceId: string; amount: number }> = []
): ConfirmDrawerInput {
  return {
    mode: "suggested",
    selectedClientId: item.client?.id ?? null,
    selectedReceiptId: item.receipt?.id ?? null,
    invoiceAllocations,
    manualReason: null,
  };
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

      {item.status === "confirmed" ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Facturas aplicadas
          </p>
          {item.appliedAllocations.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {item.appliedAllocations.map((a) => (
                <li key={a.invoiceId} className={copilotCaptionClass}>
                  {a.invoiceNumber ?? a.invoiceId} · aplicado {money(a.currencyCode, a.appliedAmount)}
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${copilotCaptionClass} mt-1`}>
              No encontramos una aplicación de este recibo a facturas en Zeta.
            </p>
          )}
          {item.reconciliationLevel ? (
            <p className={`${copilotCaptionClass} mt-2 font-medium`}>
              Nivel: {item.reconciliationLevel === "full_reconciliation" ? "Conciliación completa" : "Conciliado con recibo"}
            </p>
          ) : null}
        </div>
      ) : (
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
      )}
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
  confirmLabel = "Confirmar con recibo",
}: {
  item: EvidenceItem;
  mutating: boolean;
  actionError: string | null;
  onClose: () => void;
  onConfirm: (input: ConfirmDrawerInput) => void;
  onReject: (reason: string) => void;
  /** CTA final del drawer (default: Confirmar con recibo). */
  confirmLabel?: string;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showManual, setShowManual] = useState(false);

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
    <div
      className="fixed inset-x-0 bottom-0 top-0 z-[65] flex items-stretch justify-end bg-black/30 pt-[3.25rem] sm:pt-[3.5rem]"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
          <div className="min-w-0">
            <p className={copilotCaptionClass}>Banco → Conciliación</p>
            <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Confirmar con recibo</h3>
          </div>
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
            Este caso requiere revisión manual: no hay un recibo propuesto para vincular. Buscá &quot;Otra
            coincidencia&quot; abajo para seleccionar cliente y recibo manualmente.
          </p>
        ) : null}

        {!isTerminal ? (
          <div className="mx-4 mb-3">
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              disabled={mutating}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            >
              {showManual ? "Ocultar otra coincidencia" : "Buscar otra coincidencia"}
            </button>
            {showManual ? (
              <ManualMatchSelector
                item={item}
                mutating={mutating}
                onConfirm={(input) => onConfirm(input)}
              />
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
              onClick={() => onConfirm(suggestedConfirmInput(item, allocations))}
              disabled={mutating || !canConfirm}
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
            >
              {mutating
                ? "Confirmando…"
                : allocations.length > 0
                  ? "Confirmar con estas facturas"
                  : confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ClientOption = { id: string; name: string };
type ReceiptOption = { id: string; amount: number; currency: string; date: string; status: string | null; used: boolean };
type ManualInvoiceOption = { invoiceId: string; balanceAmount: number; currencyCode: string; issueDate: string | null; dueDate: string | null };

const MANUAL_REASON_OPTIONS = [
  { value: "cliente_incorrecto", label: "Cliente incorrecto" },
  { value: "recibo_incorrecto", label: "Recibo incorrecto" },
  { value: "varios_candidatos", label: "Había varios candidatos" },
  { value: "tercero", label: "La transferencia provino de un tercero" },
  { value: "otro", label: "Otro" },
] as const;

/**
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — "Otra coincidencia": la
 * persona busca y selecciona explícitamente cliente → recibo → facturas,
 * distinto de lo propuesto por el motor, y confirma con motivo obligatorio.
 * El movimiento bancario nunca se toca acá (queda fijo); todo lo que se
 * selecciona se revalida server-side antes de invocar la RPC canónica —
 * este componente nunca escribe nada por sí mismo.
 */
function ManualMatchSelector({
  item,
  mutating,
  onConfirm,
}: {
  item: EvidenceItem;
  mutating: boolean;
  onConfirm: (input: ConfirmDrawerInput) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptOption[]>([]);
  const [invoices, setInvoices] = useState<ManualInvoiceOption[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({});
  const [reasonOption, setReasonOption] = useState("");
  const [reasonFreeText, setReasonFreeText] = useState("");

  // Búsqueda de cliente: debounced, server-side, cancela búsquedas anteriores al cambiar el texto.
  // Con query vacío no hay nada que buscar; el render ya ignora clientResults en ese caso
  // (evita un setState síncrono dentro del efecto para el caso trivial).
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    // `setSearching(true)` vive dentro del timeout (async), no síncrono en el cuerpo del
    // efecto — evita cascading renders y además hace que "Buscando…" solo aparezca una
    // vez vencido el debounce, no en cada tecla.
    const t = setTimeout(() => {
      if (cancelled) return;
      setSearching(true);
      fetch(`/api/copilot/bank-reconciliation/clients-search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j: { ok?: boolean; data?: ClientOption[] }) => {
          if (!cancelled) setClientResults(j.ok ? j.data ?? [] : []);
        })
        .catch(() => {
          if (!cancelled) setClientResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const selectClient = (client: ClientOption) => {
    setSelectedClient(client);
    setQuery("");
    setClientResults([]);
    setSelectedReceiptId(null);
    setSelectedInvoices({});
    setLoadingReceipts(true);
    fetch(`/api/copilot/bank-reconciliation/receipts-search?clientId=${encodeURIComponent(client.id)}&currency=${encodeURIComponent(item.movement.currency)}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; data?: { receipts: ReceiptOption[]; candidateInvoices: ManualInvoiceOption[] } }) => {
        if (j.ok && j.data) {
          setReceipts(j.data.receipts);
          setInvoices(j.data.candidateInvoices);
        } else {
          setReceipts([]);
          setInvoices([]);
        }
      })
      .catch(() => {
        setReceipts([]);
        setInvoices([]);
      })
      .finally(() => setLoadingReceipts(false));
  };

  const changeClient = () => {
    setSelectedClient(null);
    setReceipts([]);
    setInvoices([]);
    setSelectedReceiptId(null);
    setSelectedInvoices({});
  };

  const toggleInvoice = (invoiceId: string, balanceAmount: number) => {
    setSelectedInvoices((prev) => {
      const next = { ...prev };
      if (invoiceId in next) delete next[invoiceId];
      else next[invoiceId] = balanceAmount;
      return next;
    });
  };

  const selectedReceipt = receipts.find((r) => r.id === selectedReceiptId) ?? null;
  const invoiceAllocations = Object.entries(selectedInvoices).map(([invoiceId, amount]) => ({ invoiceId, amount }));
  const allocatedTotal = invoiceAllocations.reduce((sum, a) => sum + a.amount, 0);
  const diff = useMemo(() => {
    if (!selectedReceipt) return null;
    return item.movement.amount - selectedReceipt.amount;
  }, [selectedReceipt, item.movement.amount]);

  const reasonText = reasonOption === "otro" ? reasonFreeText.trim() : MANUAL_REASON_OPTIONS.find((o) => o.value === reasonOption)?.label ?? "";
  const overAllocated = selectedReceipt != null && allocatedTotal > selectedReceipt.amount + 0.01;
  // Recibo obligatorio (igual que el botón de confirmación de la sugerencia): sin un
  // recibo explícito, confirm_bank_reconciliation_v1 no tiene qué vincular financieramente.
  const canConfirm = selectedClient != null && selectedReceiptId != null && reasonText.length >= 3 && !overAllocated && !mutating;

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Otra coincidencia</p>

      {selectedClient ? (
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--copilot-text)]">
          <span>
            Cliente: <span className="font-semibold">{selectedClient.name}</span>
          </span>
          <button type="button" onClick={changeClient} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Cambiar cliente
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-[var(--copilot-text)]" htmlFor="manual-client-search">
            Cliente
          </label>
          <input
            id="manual-client-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
            className="mt-1 w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
          />
          {searching ? (
            <p className={`${copilotCaptionClass} mt-1`}>Buscando…</p>
          ) : query.trim() && clientResults.length > 0 ? (
            <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
              {clientResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectClient(c)}
                    className="w-full rounded-md px-2 py-1 text-left text-xs text-[var(--copilot-text)] hover:bg-[var(--copilot-hover-bg)]"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {selectedClient ? (
        <div>
          <p className="text-xs font-medium text-[var(--copilot-text)]">Recibo</p>
          {loadingReceipts ? (
            <p className={copilotCaptionClass}>Buscando recibos…</p>
          ) : receipts.length === 0 ? (
            <p className={copilotCaptionClass}>Este cliente no tiene recibos en {item.movement.currency}.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {receipts.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs text-[var(--copilot-text)]">
                  <input
                    type="radio"
                    name="manual-receipt"
                    checked={selectedReceiptId === r.id}
                    disabled={r.used}
                    onChange={() => {
                      setSelectedReceiptId(r.id);
                      setSelectedInvoices({});
                    }}
                  />
                  <span className={r.used ? "flex-1 opacity-50" : "flex-1"}>
                    {money(r.currency, r.amount)} · {formatDate(r.date)} · {r.status ?? "—"}
                    {r.used ? " · ya usado" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {selectedReceipt ? (
        <p className={copilotCaptionClass}>
          Movimiento {money(item.movement.currency, item.movement.amount)} · Recibo {money(selectedReceipt.currency, selectedReceipt.amount)} · Diferencia{" "}
          {diff != null ? money(item.movement.currency, diff) : "—"}
        </p>
      ) : null}

      {selectedReceipt && invoices.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-[var(--copilot-text)]">Facturas (opcional)</p>
          <ul className="mt-1 space-y-1">
            {invoices.map((inv) => (
              <li key={inv.invoiceId} className="flex items-center gap-2 text-xs text-[var(--copilot-text)]">
                <input type="checkbox" checked={inv.invoiceId in selectedInvoices} onChange={() => toggleInvoice(inv.invoiceId, inv.balanceAmount)} />
                <span className="flex-1">
                  Saldo {money(inv.currencyCode, inv.balanceAmount)} · vence {formatDate(inv.dueDate)}
                </span>
              </li>
            ))}
          </ul>
          {invoiceAllocations.length > 0 ? (
            <p className={`${copilotCaptionClass} ${overAllocated ? "text-[var(--copilot-danger-text-strong)]" : ""}`}>
              Total seleccionado: {money(selectedReceipt.currency, allocatedTotal)} de {money(selectedReceipt.currency, selectedReceipt.amount)}
              {overAllocated ? " — supera el importe del recibo." : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {selectedClient ? (
        <div>
          <label className="block text-xs font-medium text-[var(--copilot-text)]" htmlFor="manual-reason">
            Motivo
          </label>
          <select
            id="manual-reason"
            value={reasonOption}
            onChange={(e) => setReasonOption(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
          >
            <option value="">Elegí un motivo…</option>
            {MANUAL_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {reasonOption === "otro" ? (
            <input
              type="text"
              value={reasonFreeText}
              onChange={(e) => setReasonFreeText(e.target.value)}
              maxLength={500}
              placeholder="Describí brevemente el motivo"
              className="mt-1 w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
            />
          ) : null}
        </div>
      ) : null}

      {selectedClient ? (
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() =>
            onConfirm({
              mode: "manual_reviewed",
              selectedClientId: selectedClient.id,
              selectedReceiptId,
              invoiceAllocations,
              manualReason: reasonText,
            })
          }
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          {mutating ? "Confirmando…" : "Confirmar selección manual"}
        </button>
      ) : null}
    </div>
  );
}
