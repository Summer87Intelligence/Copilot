"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, Loader2, SlidersHorizontal, XCircle } from "lucide-react";

import { BankMovementReconciliationDrawer } from "@/components/copilot/bank-movements/bank-movement-reconciliation-drawer";
import { BankMovementsFiltersBar } from "@/components/copilot/bank-movements/bank-movements-filters-bar";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { ReconciliationConfidence } from "@/lib/bank-movements/bank-movement-reconciliation";
import {
  computeReconciliationFilteredMeta,
  DEFAULT_RECONCILIATION_VIEW_FILTERS,
  filterReconciliationItems,
  reconciliationApiStatusFromSuggestion,
  type ReconciliationListItem,
  type ReconciliationViewFilters,
} from "@/lib/bank-movements/bank-movements-filters";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import {
  BANK_MOVEMENT_DIRECTION_LABELS,
  BANK_MOVEMENT_STATUS_LABELS,
} from "@/lib/bank-movements/bank-movements-types";

type ReconciliationSuggestion = ReconciliationListItem["suggestions"][number];

const dateFormatter = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });

const CONFIDENCE_LABELS: Record<ReconciliationConfidence, string> = {
  high: "Coincidencia alta",
  medium: "Coincidencia media",
  low: "Coincidencia baja",
};

const CONFIDENCE_STYLES: Record<ReconciliationConfidence, string> = {
  high: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  medium: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  low: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]",
};

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${numberFormatter.format(amount)}`;
}

type BankMovementsReconciliationPanelProps = {
  onMovementUpdated?: () => void | Promise<void>;
  onViewMovement?: (movementId: string) => void;
};

export function BankMovementsReconciliationPanel({
  onMovementUpdated,
  onViewMovement,
}: BankMovementsReconciliationPanelProps) {
  const [items, setItems] = useState<ReconciliationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReconciliationViewFilters>(DEFAULT_RECONCILIATION_VIEW_FILTERS);
  const [detailMovement, setDetailMovement] = useState<{ id: string; label: string } | null>(null);

  const apiStatus = reconciliationApiStatusFromSuggestion(filters.suggestion);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: apiStatus,
        confidence: "all",
      });
      const res = await fetch(`/api/copilot/bank-movements/reconciliation?${params.toString()}`);
      const json = (await res.json()) as {
        ok: boolean;
        data?: { items: ReconciliationListItem[] };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? "No se pudo cargar la conciliación.");
        return;
      }
      setItems(json.data.items);
    } catch {
      setError("No se pudo cargar la conciliación.");
    } finally {
      setLoading(false);
    }
  }, [apiStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => filterReconciliationItems(items, filters), [items, filters]);
  const meta = useMemo(() => computeReconciliationFilteredMeta(filteredItems), [filteredItems]);

  const countLabel =
    apiStatus === "matched" ? "conciliados" : apiStatus === "ignored" ? "ignorados" : "pendientes";

  const summaryCards = useMemo(
    () => [
      { label: "Pendientes", value: meta.pending_count },
      { label: "Coincidencias altas", value: meta.with_high_confidence },
      { label: "Coincidencias medias", value: meta.with_medium_confidence },
      { label: "Sin sugerencia", value: meta.without_suggestions },
      { label: "Conciliados", value: meta.matched_count },
      { label: "Ignorados", value: meta.ignored_count },
    ],
    [meta]
  );

  const reconcile = async (item: ReconciliationListItem, suggestion: ReconciliationSuggestion) => {
    setActingId(item.movement.id);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/bank-movements/${item.movement.id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: suggestion.target_type,
          target_id: suggestion.target_id,
          confidence: suggestion.confidence,
          score: suggestion.score,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo conciliar el movimiento.");
        return;
      }
      await onMovementUpdated?.();
      await load();
    } catch {
      setError("No se pudo conciliar el movimiento.");
    } finally {
      setActingId(null);
    }
  };

  const ignore = async (movementId: string) => {
    setActingId(movementId);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/bank-movements/${movementId}/ignore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo ignorar el movimiento.");
        return;
      }
      await onMovementUpdated?.();
      await load();
    } catch {
      setError("No se pudo ignorar el movimiento.");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Pagos programados de Tesorería</h2>
        <p className={`${copilotCaptionClass} mt-1`}>
          Vinculá movimientos del banco con pagos programados de Tesorería (no clientes). Esto no
          es la conciliación de cobros de clientes — para eso usá la pestaña Conciliación. Vincular
          no modifica el pago automáticamente.
        </p>
      </section>

      <BankMovementsFiltersBar
        mode="reconciliation"
        filters={filters}
        onChange={(next) => setFilters(next as ReconciliationViewFilters)}
        onClear={() => setFilters(DEFAULT_RECONCILIATION_VIEW_FILTERS)}
        showingCount={filteredItems.length}
        totalCount={items.length}
        countLabel={countLabel}
        showPeriodHint={filters.period === "current"}
        showWithSuggestionHint={filters.suggestion === "with_suggestion"}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {summaryCards.map((card) => (
          <div key={card.label} className={copilotCardStandardClass}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
              {card.label}
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">
              {loading ? "…" : card.value}
            </p>
          </div>
        ))}
      </div>

      <p className={copilotCaptionClass}>Totales del período y filtros seleccionados.</p>

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
      ) : filteredItems.length === 0 ? (
        <section className={copilotCardStandardClass}>
          <p className={copilotCaptionClass}>No hay movimientos para mostrar con estos filtros.</p>
        </section>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <ReconciliationMovementCard
              key={item.movement.id}
              item={item}
              acting={actingId === item.movement.id}
              onReconcile={(suggestion) => void reconcile(item, suggestion)}
              onIgnore={() => void ignore(item.movement.id)}
              onViewMovement={onViewMovement}
              onDetail={() =>
                setDetailMovement({ id: item.movement.id, label: item.movement.description })
              }
            />
          ))}
        </div>
      )}

      {detailMovement ? (
        <BankMovementReconciliationDrawer
          movementId={detailMovement.id}
          movementLabel={detailMovement.label}
          open
          onClose={() => setDetailMovement(null)}
          onChanged={async () => {
            await onMovementUpdated?.();
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ReconciliationMovementCard({
  item,
  acting,
  onReconcile,
  onIgnore,
  onViewMovement,
  onDetail,
}: {
  item: ReconciliationListItem;
  acting: boolean;
  onReconcile: (suggestion: ReconciliationSuggestion) => void;
  onIgnore: () => void;
  onViewMovement?: (movementId: string) => void;
  onDetail: () => void;
}) {
  const { movement } = item;
  const best = item.suggestions[0] ?? null;

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]">
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Banco
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--copilot-text)]">{movement.description}</p>
          <div className="mt-2 grid gap-1 text-xs text-[var(--copilot-muted)] sm:grid-cols-2">
            <span>Fecha: {formatDate(movement.movement_date)}</span>
            <span>Cuenta: {movement.account_label ?? movement.bank_name}</span>
            <span>Referencia: {movement.bank_reference ?? "—"}</span>
            <span>Estado: {BANK_MOVEMENT_STATUS_LABELS[movement.status]}</span>
            <span>
              {BANK_MOVEMENT_DIRECTION_LABELS[movement.direction]}:{" "}
              {formatMoney(movement.currency, resolveImportedBankMovementAmount(movement))}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Sugerencia Copilot
          </p>
          {best ? (
            <div className="mt-1 space-y-2">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLES[best.confidence]}`}
              >
                {CONFIDENCE_LABELS[best.confidence]}
              </span>
              <p className="text-sm font-medium text-[var(--copilot-text)]">{best.target.title}</p>
              <div className="grid gap-1 text-xs text-[var(--copilot-muted)] sm:grid-cols-2">
                <span>Vencimiento: {formatDate(best.target.due_date)}</span>
                <span>Monto: {formatMoney(best.target.currency_code, best.target.amount_estimated)}</span>
                <span>Estado: {best.target.status}</span>
              </div>
              {best.reasons.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-[var(--copilot-text)]">
                  {best.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className={`${copilotCaptionClass} mt-1`}>Sin coincidencia clara</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--copilot-border)] px-4 py-3">
        {onViewMovement ? (
          <button
            type="button"
            onClick={() => onViewMovement(movement.id)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
            Ver movimiento
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDetail}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          <SlidersHorizontal className="mr-1 h-3.5 w-3.5" aria-hidden />
          Conciliación detallada
        </button>
        <button
          type="button"
          onClick={onIgnore}
          disabled={acting || movement.status === "ignored"}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden />
          Ignorar
        </button>
        {best && movement.status !== "matched" ? (
          <button
            type="button"
            onClick={() => onReconcile(best)}
            disabled={acting}
            className={copilotButtonClassName({ variant: "primary", size: "sm" })}
          >
            {acting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
            )}
            Vincular con pago programado
          </button>
        ) : null}
      </div>
    </article>
  );
}
