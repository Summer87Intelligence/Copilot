"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, TriangleAlert, X } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";

const numberFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });

function money(currency: string | null, amount: number): string {
  return `${currency ?? ""} ${numberFormatter.format(amount)}`.trim();
}

type LinkView = {
  id: string;
  targetType: string;
  targetId: string | null;
  appliedAmount: number;
  currency: "UYU" | "USD";
  method: string;
  confidence: string | null;
  archivedAt: string | null;
};

type MovementView = {
  movementId: string;
  amount: number;
  currency: string | null;
  direction: "inflow" | "outflow";
  links: LinkView[];
  applied: number;
  remaining: number;
  status: "pending" | "partial" | "reconciled" | "ignored" | "duplicate";
};

type Suggestion = {
  targetType: "receipt" | "planned_cash_obligation" | "treasury_income" | "treasury_expense";
  targetId: string;
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
  suggestedApplyAmount: number;
  candidate: { title: string; currency: string; direction: "inflow" | "outflow"; date: string };
};

const STATUS_LABELS: Record<MovementView["status"], string> = {
  pending: "Pendiente",
  partial: "Parcial",
  reconciled: "Conciliado",
  ignored: "Ignorado",
  duplicate: "Duplicado",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  receipt: "Recibo",
  planned_cash_obligation: "Pago programado",
  treasury_income: "Ingreso Tesorería",
  treasury_expense: "Egreso Tesorería",
  bank_movement: "Transferencia",
  manual: "Manual",
  ignored: "Ignorado",
};

type Props = {
  movementId: string;
  movementLabel?: string;
  open: boolean;
  onClose: () => void;
  /** @deprecated Este drawer es solo lectura desde BANK-RECONCILIATION-CANONICAL-ENGINE-001; ya no dispara escrituras. */
  onChanged?: () => void | Promise<void>;
};

export function BankMovementReconciliationDrawer({ movementId, movementLabel, open, onClose }: Props) {
  const [view, setView] = useState<MovementView | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [viewRes, sugRes] = await Promise.all([
        fetch(`/api/copilot/bank-movements/${movementId}/reconciliation-links`),
        fetch(`/api/copilot/bank-movements/${movementId}/reconciliation-links/suggestions`),
      ]);
      const viewJson = (await viewRes.json()) as { ok: boolean; data?: MovementView; migrationPending?: boolean; error?: string };
      if (!viewRes.ok || !viewJson.ok || !viewJson.data) {
        setError(viewJson.error ?? "No se pudo cargar la conciliación.");
        return;
      }
      setView(viewJson.data);
      setMigrationPending(Boolean(viewJson.migrationPending));
      const sugJson = (await sugRes.json()) as { ok: boolean; data?: { suggestions: Suggestion[] } };
      setSuggestions(sugRes.ok && sugJson.ok && sugJson.data ? sugJson.data.suggestions : []);
    } catch {
      setError("No se pudo cargar la conciliación.");
    } finally {
      setLoading(false);
    }
  }, [movementId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — Motor C queda READ-ONLY:
  // este drawer escribía `bank_movement_reconciliation_links` directo por
  // repositorio (bypaseando `confirm_bank_reconciliation_v1` / sin generar
  // `payment_allocations` ni `reconciliation_events`). Las acciones de escritura
  // se retiraron a propósito; ver docs/architecture/bank-reconciliation-canonical-engine.md.
  // La confirmación real de conciliaciones de clientes vive en la pestaña
  // Conciliación (motor canónico D) — este drawer solo permite consultar.

  if (!open) return null;

  const activeLinks = (view?.links ?? []).filter((l) => l.archivedAt == null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <button type="button" aria-label="Cerrar" className="flex-1" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Conciliación detallada</h3>
            {movementLabel ? <p className={`${copilotCaptionClass} mt-0.5`}>{movementLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-[var(--copilot-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
          </div>
        ) : (
          <>
            {migrationPending ? (
              <p className="mt-4 rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]">
                La conciliación detallada aún no está habilitada en este entorno.
              </p>
            ) : null}

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2 text-xs text-[var(--copilot-muted)]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Esta vista quedó de solo lectura: las conciliaciones de clientes ahora se confirman desde la
                pestaña <strong>Conciliación</strong>.
              </span>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
                {error}
              </p>
            ) : null}

            {view ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "Estado", value: STATUS_LABELS[view.status] },
                  { label: "Aplicado", value: money(view.currency, view.applied) },
                  { label: "Restante", value: money(view.currency, view.remaining) },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-2 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">{c.label}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--copilot-text)]">{c.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <section className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Relaciones actuales</p>
              {activeLinks.length === 0 ? (
                <p className={`${copilotCaptionClass} mt-1`}>Sin relaciones aún.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {activeLinks.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--copilot-border)] px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-[var(--copilot-text)]">
                          {TARGET_TYPE_LABELS[l.targetType] ?? l.targetType}
                        </p>
                        <p className={copilotCaptionClass}>{money(l.currency, l.appliedAmount)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Sugerencias</p>
              {suggestions.length === 0 ? (
                <p className={`${copilotCaptionClass} mt-1`}>Sin coincidencias claras.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {suggestions.map((s) => (
                    <li key={`${s.targetType}:${s.targetId}`} className="rounded-lg border border-[var(--copilot-border)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-[var(--copilot-text)]">{s.candidate.title}</p>
                        <span className="text-[10px] uppercase text-[var(--copilot-muted)]">{s.confidence}</span>
                      </div>
                      <p className={`${copilotCaptionClass} mt-0.5`}>
                        {TARGET_TYPE_LABELS[s.targetType] ?? s.targetType} · {money(s.candidate.currency, s.suggestedApplyAmount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
