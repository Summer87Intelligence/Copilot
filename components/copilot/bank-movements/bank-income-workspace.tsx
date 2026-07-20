"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { FilterBar, FilterField, FilterSelect, FilterSearchInput } from "@/components/copilot/ui/filter-bar";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import { paginate, pageAfterFilterChange } from "@/lib/ui/table-pagination-model";
import { isBankMovementHistorical } from "@/lib/bank/canonical/historical-policy";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import type { IncomeCandidate, IncomeConfidence } from "@/lib/bank-movements/bank-income-matching";
import {
  ConfidenceBadge,
  ConflictWarning,
  EvidenceSummary,
  ReconciliationEvidenceDrawer,
  confirmCanonicalEvidence,
  rejectCanonicalEvidence,
  suggestedConfirmInput,
  type ConfirmDrawerInput,
  type EvidenceItem,
} from "@/components/copilot/bank-movements/canonical-evidence-ui";

/**
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 — Ingresos es la única
 * bandeja operativa diaria: identificar cliente y conciliar quedan en una misma
 * pantalla. Consume exclusivamente el motor canónico (D) — sin motor nuevo, sin
 * writer paralelo. La pestaña Conciliación independiente fue absorbida acá.
 *
 * Cada `bank_movement` positivo es la unidad principal y aparece una única vez.
 * Para el subconjunto "operativo" (post-corte) se trae, en un solo request
 * batch, la sugerencia canónica vigente (si existe) con su evidencia completa;
 * los movimientos históricos nunca tienen sugerencias `operational` (política
 * de corte ya establecida), así que no requieren ese request.
 */

type IncomeRowStatus =
  | "sin_identificar"
  | "cliente_sugerido"
  | "con_coincidencia"
  | "requiere_revision"
  | "conciliado"
  | "sugerencia_rechazada"
  | "ignorado";

type IncomeWorkspaceRowDTO = {
  movement: { id: string; date: string; amount: number; currency: string; descriptionMasked: string; accountLabel: string | null; bankMovementStatus: string };
  status: IncomeRowStatus;
  evidence: EvidenceItem | null;
};

type WorkspaceCounters = {
  pendientes: number;
  conCoincidencia: number;
  requiereRevision: number;
  sinIdentificar: number;
  conciliadosHoy: number;
};

const ZERO_COUNTERS: WorkspaceCounters = { pendientes: 0, conCoincidencia: 0, requiereRevision: 0, sinIdentificar: 0, conciliadosHoy: 0 };

const STATUS_BADGE: Record<IncomeRowStatus, string> = {
  sin_identificar: "Sin identificar",
  cliente_sugerido: "Cliente sugerido",
  con_coincidencia: "Con coincidencia",
  requiere_revision: "Requiere revisión",
  conciliado: "Conciliado",
  sugerencia_rechazada: "Sugerencia rechazada",
  ignorado: "Ignorado",
};

const STATUS_BADGE_STYLE: Record<IncomeRowStatus, string> = {
  sin_identificar: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-muted)]",
  cliente_sugerido: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]",
  con_coincidencia: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  requiere_revision: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  conciliado: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  sugerencia_rechazada: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  ignorado: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-muted)]",
};

const numberFmt = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });
function money(currency: string, amount: number): string {
  return `${currency} ${numberFmt.format(amount)}`;
}

type ScopeFilter = "operational" | "historical" | "all";
type StatusFilter = "todos" | "pendientes" | "con_coincidencia" | "requiere_revision" | "conciliados" | "sin_identificar";

type IncomeFilters = {
  scope: ScopeFilter;
  status: StatusFilter;
  currency: "all" | "UYU" | "USD";
  confidence: "all" | "alta" | "media" | "baja" | "sin_sugerencia";
  text: string;
  amount: string;
};

const DEFAULT_FILTERS: IncomeFilters = {
  scope: "operational",
  status: "pendientes",
  currency: "all",
  confidence: "all",
  text: "",
  amount: "",
};

const PAGE_SIZE = 15;

type PortfolioClient = { company_id: string; name: string };

export function BankIncomeWorkspace({
  onChanged,
  initialMovementId,
  onInitialMovementConsumed,
}: {
  onChanged?: () => void;
  /** FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001: deep link (URL antigua de Conciliación normalizada). */
  initialMovementId?: string | null;
  onInitialMovementConsumed?: () => void;
}) {
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [clients, setClients] = useState<PortfolioClient[]>([]);
  const [rowsById, setRowsById] = useState<Record<string, IncomeWorkspaceRowDTO>>({});
  const [counters, setCounters] = useState<WorkspaceCounters>(ZERO_COUNTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filters, setFilters] = useState<IncomeFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [openMovementId, setOpenMovementId] = useState<string | null>(null);
  const [drawerMovementId, setDrawerMovementId] = useState<string | null>(null);
  const [mutating, setMutating] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [movRes, cliRes] = await Promise.all([
        fetch("/api/copilot/bank-movements?direction=inflow"),
        fetch("/api/copilot/portfolio"),
      ]);
      const movJson = (await movRes.json().catch(() => null)) as { ok?: boolean; data?: BankMovement[] } | null;
      const cliJson = (await cliRes.json().catch(() => null)) as
        | { ok?: boolean; rows?: PortfolioClient[]; portfolio?: { rows?: PortfolioClient[] } }
        | null;
      const movs = movJson?.ok ? movJson.data ?? [] : [];
      setMovements(movs);
      const rows = cliJson?.rows ?? cliJson?.portfolio?.rows ?? [];
      setClients(rows.map((r) => ({ company_id: r.company_id, name: r.name })));

      const operationalIds = movs.filter((m) => !isBankMovementHistorical(m)).map((m) => m.id);
      if (operationalIds.length === 0) {
        setRowsById({});
        setCounters(ZERO_COUNTERS);
        return;
      }
      const res2 = await fetch(
        `/api/copilot/bank-movements/canonical-suggestions?workspace=income&movementIds=${operationalIds.map(encodeURIComponent).join(",")}`
      );
      const json2 = (await res2.json()) as { ok?: boolean; data?: IncomeWorkspaceRowDTO[]; meta?: { counters?: WorkspaceCounters }; error?: string };
      if (!res2.ok || !json2.ok) {
        setError(json2.error ?? "No se pudo cargar la bandeja de ingresos.");
        return;
      }
      const map: Record<string, IncomeWorkspaceRowDTO> = {};
      for (const row of json2.data ?? []) map[row.movement.id] = row;
      setRowsById(map);
      setCounters(json2.meta?.counters ?? ZERO_COUNTERS);
    } catch {
      setError("No se pudo cargar la bandeja de ingresos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  // Deep link: movimiento puntual llegado desde una URL antigua de Conciliación.
  useEffect(() => {
    if (!initialMovementId || loading) return;
    setFilters(DEFAULT_FILTERS);
    setOpenMovementId(initialMovementId);
    if (rowsById[initialMovementId]?.evidence) setDrawerMovementId(initialMovementId);
    onInitialMovementConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMovementId, loading]);

  const rowView = useCallback(
    (movement: BankMovement): IncomeWorkspaceRowDTO => {
      const row = rowsById[movement.id];
      if (row) return row;
      // Histórico (fuera del lote operativo) o movimiento sin sugerencia posible: nunca
      // tiene evidencia `operational` por política de corte — no hace falta pedirla.
      const status: IncomeRowStatus = movement.status === "ignored" ? "ignorado" : "sin_identificar";
      return {
        movement: {
          id: movement.id,
          date: movement.movement_date,
          amount: movement.amount,
          currency: movement.currency,
          descriptionMasked: movement.description,
          accountLabel: movement.account_label,
          bankMovementStatus: movement.status,
        },
        status,
        evidence: null,
      };
    },
    [rowsById]
  );

  const filtered = useMemo(() => {
    const text = filters.text.trim().toLowerCase();
    const amount = filters.amount.trim();
    return movements.filter((m) => {
      const historical = isBankMovementHistorical(m);
      if (filters.scope === "operational" && historical) return false;
      if (filters.scope === "historical" && !historical) return false;
      if (filters.currency !== "all" && m.currency !== filters.currency) return false;
      if (text && !(m.description ?? "").toLowerCase().includes(text)) return false;
      if (amount && !String(m.amount).includes(amount)) return false;

      const { status, evidence } = rowView(m);
      if (filters.confidence !== "all" && evidence?.confidenceLevel !== filters.confidence) return false;

      if (filters.status === "pendientes") {
        if (!["con_coincidencia", "requiere_revision", "sin_identificar", "cliente_sugerido"].includes(status)) return false;
      } else if (filters.status === "con_coincidencia" && status !== "con_coincidencia") {
        return false;
      } else if (filters.status === "requiere_revision" && status !== "requiere_revision") {
        return false;
      } else if (filters.status === "conciliados" && status !== "conciliado") {
        return false;
      } else if (filters.status === "sin_identificar" && status !== "sin_identificar" && status !== "cliente_sugerido") {
        return false;
      }
      return true;
    });
  }, [movements, filters, rowView]);

  const { pageRows, safePage, totalPages, total, from, to } = paginate(filtered, page, PAGE_SIZE);

  const clientName = useCallback((id: string) => clients.find((c) => c.company_id === id)?.name ?? "Cliente", [clients]);

  const refreshMovementRow = useCallback(
    async (movementId: string) => {
      try {
        const res = await fetch(`/api/copilot/bank-movements/canonical-suggestions?workspace=income&movementIds=${encodeURIComponent(movementId)}`);
        const json = (await res.json()) as { ok?: boolean; data?: IncomeWorkspaceRowDTO[]; meta?: { counters?: WorkspaceCounters } };
        if (json.ok) {
          const row = (json.data ?? [])[0];
          if (row) setRowsById((prev) => ({ ...prev, [movementId]: row }));
          if (json.meta?.counters) setCounters(json.meta.counters);
        }
      } catch {
        // La bandeja igual queda usable; una recarga manual la sincroniza.
      }
    },
    []
  );

  const handleConfirm = useCallback(
    async (item: EvidenceItem, input: ConfirmDrawerInput) => {
      if (mutating[item.suggestionId]) return;
      setMutating((m) => ({ ...m, [item.suggestionId]: true }));
      setActionErrors((prev) => {
        const next = { ...prev };
        delete next[item.suggestionId];
        return next;
      });
      const result = await confirmCanonicalEvidence(item, input);
      setMutating((m) => {
        const next = { ...m };
        delete next[item.suggestionId];
        return next;
      });
      if (!result.ok) {
        setActionErrors((prev) => ({ ...prev, [item.suggestionId]: result.error ?? "No se pudo confirmar." }));
        return;
      }
      const verb = input.mode === "manual_reviewed" ? "Selección manual confirmada" : "Conciliación confirmada";
      setFeedback(`${verb}${result.idempotent ? " (ya estaba procesada)." : "."}`);
      setDrawerMovementId(null);
      await refreshMovementRow(item.movement.id);
      onChanged?.();
    },
    [mutating, refreshMovementRow, onChanged]
  );

  const handleReject = useCallback(
    async (item: EvidenceItem, reason: string) => {
      if (mutating[item.suggestionId]) return;
      setMutating((m) => ({ ...m, [item.suggestionId]: true }));
      setActionErrors((prev) => {
        const next = { ...prev };
        delete next[item.suggestionId];
        return next;
      });
      const result = await rejectCanonicalEvidence(item, reason);
      setMutating((m) => {
        const next = { ...m };
        delete next[item.suggestionId];
        return next;
      });
      if (!result.ok) {
        setActionErrors((prev) => ({ ...prev, [item.suggestionId]: result.error ?? "No se pudo rechazar." }));
        return;
      }
      setFeedback(`Sugerencia rechazada${result.idempotent ? " (ya estaba procesada)." : "."}`);
      setDrawerMovementId(null);
      setRejectingId(null);
      await refreshMovementRow(item.movement.id);
      onChanged?.();
    },
    [mutating, refreshMovementRow, onChanged]
  );

  const drawerMovement = movements.find((m) => m.id === drawerMovementId) ?? null;
  const drawerEvidence = drawerMovementId ? rowView(drawerMovement ?? ({ id: drawerMovementId } as BankMovement)).evidence : null;

  return (
    <div className="space-y-4">
      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Ingresos</h2>
        <p className={`${copilotCaptionClass} mt-1`}>
          Identificá y conciliá cada transferencia recibida en una sola pantalla: cliente, recibo, facturas y
          confirmación. Esta bandeja usa únicamente el motor canónico de conciliación.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className={copilotCardStandardClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Pendientes</p>
          <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{loading ? "…" : counters.pendientes}</p>
        </div>
        <div className={copilotCardStandardClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Con coincidencia</p>
          <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{loading ? "…" : counters.conCoincidencia}</p>
        </div>
        <div className={copilotCardStandardClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Requieren revisión</p>
          <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{loading ? "…" : counters.requiereRevision}</p>
        </div>
        <div className={copilotCardStandardClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Sin identificar</p>
          <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{loading ? "…" : counters.sinIdentificar}</p>
        </div>
        <div className={copilotCardStandardClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Conciliados hoy</p>
          <p className="mt-1 text-xl font-semibold text-[var(--copilot-text)]">{loading ? "…" : counters.conciliadosHoy}</p>
        </div>
      </div>

      <FilterBar
        values={filters}
        defaults={DEFAULT_FILTERS}
        onClear={() => {
          setFilters(DEFAULT_FILTERS);
          setPage(pageAfterFilterChange());
        }}
      >
        <FilterField label="Alcance" htmlFor="income-filter-scope">
          <FilterSelect
            id="income-filter-scope"
            value={filters.scope}
            onChange={(v) => {
              setFilters((f) => ({ ...f, scope: v as ScopeFilter }));
              setPage(pageAfterFilterChange());
            }}
            options={[
              { value: "operational", label: "Operativos" },
              { value: "historical", label: "Históricos" },
              { value: "all", label: "Todos" },
            ]}
            ariaLabel="Filtrar por alcance"
          />
        </FilterField>
        <FilterField label="Estado" htmlFor="income-filter-status">
          <FilterSelect
            id="income-filter-status"
            value={filters.status}
            onChange={(v) => {
              setFilters((f) => ({ ...f, status: v as StatusFilter }));
              setPage(pageAfterFilterChange());
            }}
            options={[
              { value: "todos", label: "Todos" },
              { value: "pendientes", label: "Pendientes" },
              { value: "con_coincidencia", label: "Con coincidencia" },
              { value: "requiere_revision", label: "Requieren revisión" },
              { value: "conciliados", label: "Conciliados" },
              { value: "sin_identificar", label: "Sin identificar" },
            ]}
            ariaLabel="Filtrar por estado"
          />
        </FilterField>
        <FilterField label="Moneda" htmlFor="income-filter-currency">
          <FilterSelect
            id="income-filter-currency"
            value={filters.currency}
            onChange={(v) => {
              setFilters((f) => ({ ...f, currency: v as IncomeFilters["currency"] }));
              setPage(pageAfterFilterChange());
            }}
            options={[
              { value: "all", label: "Todas" },
              { value: "UYU", label: "UYU" },
              { value: "USD", label: "USD" },
            ]}
            ariaLabel="Filtrar por moneda"
          />
        </FilterField>
        <FilterField label="Confianza" htmlFor="income-filter-confidence">
          <FilterSelect
            id="income-filter-confidence"
            value={filters.confidence}
            onChange={(v) => {
              setFilters((f) => ({ ...f, confidence: v as IncomeFilters["confidence"] }));
              setPage(pageAfterFilterChange());
            }}
            options={[
              { value: "all", label: "Todas" },
              { value: "alta", label: "Alta" },
              { value: "media", label: "Media" },
              { value: "baja", label: "Baja" },
              { value: "sin_sugerencia", label: "Sin sugerencia" },
            ]}
            ariaLabel="Filtrar por confianza"
          />
        </FilterField>
        <FilterField label="Búsqueda" htmlFor="income-filter-text" className="min-w-[180px] flex-1">
          <FilterSearchInput
            id="income-filter-text"
            value={filters.text}
            onChange={(v) => {
              setFilters((f) => ({ ...f, text: v }));
              setPage(pageAfterFilterChange());
            }}
            placeholder="Descripción bancaria…"
            ariaLabel="Buscar movimiento"
          />
        </FilterField>
        <FilterField label="Monto" htmlFor="income-filter-amount">
          <FilterSearchInput
            id="income-filter-amount"
            value={filters.amount}
            onChange={(v) => {
              setFilters((f) => ({ ...f, amount: v }));
              setPage(pageAfterFilterChange());
            }}
            placeholder="Ej. 20000"
            ariaLabel="Buscar por monto"
          />
        </FilterField>
      </FilterBar>

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
          Cargando ingresos…
        </div>
      ) : pageRows.length === 0 ? (
        <section className={copilotCardStandardClass}>
          <p className={copilotCaptionClass}>No hay ingresos que coincidan con estos filtros.</p>
        </section>
      ) : (
        <>
          <ul className="space-y-2">
            {pageRows.map((movement) => {
              const view = rowView(movement);
              return (
                <IncomeRow
                  key={movement.id}
                  movement={movement}
                  view={view}
                  open={openMovementId === movement.id}
                  onToggle={() => setOpenMovementId(openMovementId === movement.id ? null : movement.id)}
                  clients={clients}
                  clientName={clientName}
                  mutating={view.evidence ? Boolean(mutating[view.evidence.suggestionId]) : false}
                  actionError={view.evidence ? actionErrors[view.evidence.suggestionId] ?? null : null}
                  isRejecting={view.evidence ? rejectingId === view.evidence.suggestionId : false}
                  onQuickConfirm={() => view.evidence && void handleConfirm(view.evidence, suggestedConfirmInput(view.evidence, []))}
                  onOpenDrawer={() => setDrawerMovementId(movement.id)}
                  onStartReject={() => view.evidence && setRejectingId(view.evidence.suggestionId)}
                  onCancelReject={() => setRejectingId(null)}
                  onSubmitReject={(reason) => view.evidence && void handleReject(view.evidence, reason)}
                  onAssociated={() => {
                    onChanged?.();
                    void refreshMovementRow(movement.id);
                  }}
                />
              );
            })}
          </ul>
          <TablePagination page={safePage} totalPages={totalPages} from={from} to={to} total={total} itemLabel="ingresos" onPageChange={setPage} />
        </>
      )}

      {drawerMovementId && drawerEvidence ? (
        <ReconciliationEvidenceDrawer
          item={drawerEvidence}
          mutating={Boolean(mutating[drawerEvidence.suggestionId])}
          actionError={actionErrors[drawerEvidence.suggestionId] ?? null}
          onClose={() => setDrawerMovementId(null)}
          onConfirm={(input) => void handleConfirm(drawerEvidence, input)}
          onReject={(reason) => void handleReject(drawerEvidence, reason)}
        />
      ) : null}
    </div>
  );
}

function IncomeRow({
  movement,
  view,
  open,
  onToggle,
  clients,
  clientName,
  mutating,
  actionError,
  isRejecting,
  onQuickConfirm,
  onOpenDrawer,
  onStartReject,
  onCancelReject,
  onSubmitReject,
  onAssociated,
}: {
  movement: BankMovement;
  view: IncomeWorkspaceRowDTO;
  open: boolean;
  onToggle: () => void;
  clients: PortfolioClient[];
  clientName: (id: string) => string;
  mutating: boolean;
  actionError: string | null;
  isRejecting: boolean;
  onQuickConfirm: () => void;
  onOpenDrawer: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onSubmitReject: (reason: string) => void;
  onAssociated: () => void;
}) {
  const [reason, setReason] = useState("");
  const evidence = view.evidence;
  const canQuickConfirm =
    evidence != null &&
    evidence.status !== "confirmed" &&
    evidence.status !== "rejected" &&
    evidence.confidenceLevel === "alta" &&
    !evidence.payer?.hasConflict &&
    evidence.receipt != null;

  return (
    <li className="overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--copilot-text)]">{movement.description}</p>
          <p className={copilotCaptionClass}>
            {movement.movement_date.slice(0, 10)} · {money(movement.currency, movement.amount)}
            {evidence?.client ? ` · ${evidence.client.name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE_STYLE[view.status]}`}>
            {STATUS_BADGE[view.status]}
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </div>
      </button>

      {open ? (
        <div className="border-t border-[var(--copilot-border)] px-3 py-3">
          {evidence ? (
            <EvidenceRowBody
              item={evidence}
              status={view.status}
              canQuickConfirm={canQuickConfirm}
              mutating={mutating}
              actionError={actionError}
              isRejecting={isRejecting}
              reason={reason}
              setReason={setReason}
              onQuickConfirm={onQuickConfirm}
              onOpenDrawer={onOpenDrawer}
              onStartReject={onStartReject}
              onCancelReject={onCancelReject}
              onSubmitReject={onSubmitReject}
            />
          ) : view.status === "ignorado" ? (
            <p className={copilotCaptionClass}>
              Este movimiento está marcado como ignorado. Reactivalo desde Movimientos si corresponde revisarlo.
            </p>
          ) : (
            <PreliminaryIdentification movement={movement} clients={clients} clientName={clientName} onAssociated={onAssociated} />
          )}
        </div>
      ) : null}
    </li>
  );
}

function EvidenceRowBody({
  item,
  status,
  canQuickConfirm,
  mutating,
  actionError,
  isRejecting,
  reason,
  setReason,
  onQuickConfirm,
  onOpenDrawer,
  onStartReject,
  onCancelReject,
  onSubmitReject,
}: {
  item: EvidenceItem;
  status: IncomeRowStatus;
  canQuickConfirm: boolean;
  mutating: boolean;
  actionError: string | null;
  isRejecting: boolean;
  reason: string;
  setReason: (v: string) => void;
  onQuickConfirm: () => void;
  onOpenDrawer: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onSubmitReject: (reason: string) => void;
}) {
  const isTerminal = status === "conciliado" || status === "sugerencia_rechazada";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Posible coincidencia en Zeta</p>
        <ConfidenceBadge item={item} />
      </div>

      <EvidenceSummary item={item} />

      {item.reasons.length > 0 || item.warnings.length > 0 ? (
        <div>
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

      {item.payer?.hasConflict ? <ConflictWarning /> : null}

      {status === "conciliado" ? (
        <p className="text-xs text-[var(--copilot-success-text-strong)]">Esta conciliación ya está confirmada.</p>
      ) : status === "sugerencia_rechazada" ? (
        <p className={copilotCaptionClass}>
          Esta sugerencia fue rechazada. El movimiento sigue disponible y puede recibir una nueva sugerencia del motor.
        </p>
      ) : null}

      {actionError ? (
        <p className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
          {actionError}
        </p>
      ) : null}

      {isRejecting ? (
        <div className="space-y-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
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
            <button type="button" onClick={onCancelReject} className={copilotButtonClassName({ variant: "ghost", size: "sm" })} disabled={mutating}>
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

      {!isTerminal ? (
        <div className="flex flex-wrap gap-2">
          {canQuickConfirm ? (
            <button type="button" onClick={onQuickConfirm} disabled={mutating} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
              {mutating ? "Confirmando…" : "Confirmar conciliación"}
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
            <button type="button" onClick={onStartReject} disabled={mutating} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              Rechazar sugerencia
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Identificación preliminar (Motor B, `bank-income-matching`): evidencia de
 * apoyo cuando el motor canónico todavía no propuso ninguna sugerencia para
 * este movimiento. Nunca completa una conciliación — solo asocia un cliente
 * probable, sin tocar recibos/facturas/caja. Ver sección 8/9 del pedido:
 * "Buscar coincidencia" queda como identificación read-only/manual mientras
 * no exista un flujo seguro para generar una suggestion canónica desde acá.
 */
function PreliminaryIdentification({
  movement,
  clients,
  clientName,
  onAssociated,
}: {
  movement: BankMovement;
  clients: PortfolioClient[];
  clientName: (id: string) => string;
  onAssociated: () => void;
}) {
  const [candidates, setCandidates] = useState<IncomeCandidate[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rememberAlias, setRememberAlias] = useState(true);
  const [manualClientId, setManualClientId] = useState("");
  const [search, setSearch] = useState("");
  const [associated, setAssociated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingSug(true);
    fetch(`/api/copilot/bank-movements/${movement.id}/income-suggestions`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; candidates?: IncomeCandidate[] }) => {
        if (cancelled) return;
        setCandidates(j?.ok ? j.candidates ?? [] : []);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSug(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movement.id]);

  const associate = useCallback(
    async (payload: { client_id: string; billing_concept_id?: string | null; confidence?: IncomeConfidence | null; score?: number | null; reasons?: string[] }) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/copilot/bank-movements/${movement.id}/income-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", remember_alias: rememberAlias, ...payload }),
        });
        const json = (await res.json()) as { ok?: boolean };
        if (json?.ok) {
          setAssociated(true);
          onAssociated();
        }
      } finally {
        setBusy(false);
      }
    },
    [movement.id, rememberAlias, onAssociated]
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, search]);

  if (associated) {
    return <p className="text-xs text-[var(--copilot-success-text-strong)]">Identificación preliminar guardada. Refrescá para ver la conciliación si el motor ya generó una sugerencia.</p>;
  }

  return (
    <div className="space-y-3">
      <p className={copilotCaptionClass}>
        El motor canónico todavía no propuso una coincidencia para este movimiento. Esto es solo identificación
        preliminar de cliente — no conciliación. La conciliación real siempre se hace vía el motor canónico.
      </p>

      {loadingSug ? (
        <p className={copilotCaptionClass}>Buscando posibles clientes…</p>
      ) : candidates && candidates.length > 0 ? (
        <div className="space-y-2">
          <p className={copilotCaptionClass}>Posibles clientes (identificación preliminar):</p>
          {candidates.map((c) => (
            <div key={`${c.clientId}:${c.conceptId ?? ""}`} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--copilot-text)]">{c.clientName}</span>
                {c.conceptLabel ? <span className={copilotCaptionClass}>· {c.conceptLabel}</span> : null}
              </div>
              {c.reasons.length > 0 ? <p className={`${copilotCaptionClass} mt-1`}>{c.reasons.join(" · ")}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void associate({ client_id: c.clientId, billing_concept_id: c.conceptId, confidence: c.confidence, score: c.score, reasons: c.reasons })}
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  Identificar preliminarmente
                </button>
                <a href={`/copilot/clientes/${c.clientId}`} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
                  Ver cliente <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={copilotCaptionClass}>No hay una sugerencia clara. Elegí el cliente manualmente.</p>
      )}

      <div className="rounded-lg border border-dashed border-[var(--copilot-border)] p-3">
        <p className={copilotCaptionClass}>Identificar otro cliente</p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="mt-1 w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2 py-1 text-xs text-[var(--copilot-text)]"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filteredClients.map((c) => (
            <button
              key={c.company_id}
              type="button"
              onClick={() => setManualClientId(c.company_id)}
              className={copilotButtonClassName({ variant: manualClientId === c.company_id ? "primary" : "ghost", size: "sm" })}
            >
              {c.name}
            </button>
          ))}
        </div>
        {manualClientId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void associate({ client_id: manualClientId })}
            className={`mt-2 ${copilotButtonClassName({ variant: "primary", size: "sm" })}`}
          >
            Confirmar identificación de {clientName(manualClientId)}
          </button>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-xs text-[var(--copilot-muted)]">
        <input type="checkbox" checked={rememberAlias} onChange={(e) => setRememberAlias(e.target.checked)} />
        Recordar este nombre bancario para el cliente
      </label>
    </div>
  );
}
