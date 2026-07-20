"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { HumanConfidenceLevel } from "@/lib/bank/canonical/reconciliation-confidence";

/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — bandeja diaria de Conciliación.
 * Consume ÚNICAMENTE `/api/copilot/bank-movements/canonical-suggestions`
 * (`suggestion_scope='operational'` del motor canónico D). Solo lectura por
 * ahora: Confirmar/Rechazar quedan para BANK-CANONICAL-CONFIRM-UI, una fase
 * separada que sí llamará `confirm_/reverse_bank_reconciliation_v1`. Este panel
 * nunca escribe nada.
 */
type EvidenceItem = {
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

export function BankCanonicalReconciliationPanel() {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/bank-movements/canonical-suggestions?limit=${PAGE_SIZE}&offset=${offset}`);
      const json = (await res.json()) as { ok: boolean; data?: EvidenceItem[]; meta?: { total: number }; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo cargar la conciliación.");
        return;
      }
      setItems(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
      setFocusIndex(0);
    } catch {
      setError("No se pudo cargar la conciliación.");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const goNextPending = () => {
    if (focusIndex + 1 < items.length) {
      setFocusIndex((i) => i + 1);
    } else if (offset + PAGE_SIZE < total) {
      setOffset((o) => o + PAGE_SIZE);
    }
  };

  return (
    <div className="space-y-4">
      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Conciliación</h2>
        <p className={`${copilotCaptionClass} mt-1`}>
          Revisá cada ingreso con su cliente, recibo y facturas propuestos. Esta bandeja usa únicamente el motor
          canónico de conciliación — nunca mezcla histórico ni auditoría.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
      </div>

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
            No hay sugerencias operativas pendientes todavía. El motor canónico genera sugerencias en segundo
            plano; si esperabas ver casos acá, confirmá que el proceso de generación ya corrió para este workspace.
          </p>
        </section>
      ) : (
        <>
          <p className={copilotCaptionClass}>Caso {focusIndex + 1} de {items.length} en esta página · {total} en total.</p>
          <EvidenceCard item={items[focusIndex]!} onNext={goNextPending} />
        </>
      )}
    </div>
  );
}

function EvidenceCard({ item, onNext }: { item: EvidenceItem; onNext: () => void }) {
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--copilot-border)] px-4 py-3">
        <p className={copilotCaptionClass}>
          Confirmar / Rechazar / Ignorar llegan en la próxima fase (BANK-CANONICAL-CONFIRM-UI), usando la RPC
          canónica. Esta bandeja hoy solo muestra evidencia.
        </p>
        <button type="button" onClick={onNext} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
          Siguiente pendiente
        </button>
      </div>
    </article>
  );
}
