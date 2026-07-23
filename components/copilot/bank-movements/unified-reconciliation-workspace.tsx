"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BankDrawerBody,
  BankDrawerHeader,
  BankDrawerShell,
} from "@/components/copilot/bank-movements/bank-drawer-shell";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotMetricLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  unifiedCaseStatusLabel,
  type UnifiedCaseStatus,
} from "@/lib/bank/canonical/unified-reconciliation-status";

/**
 * FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001 — vista unificada.
 * FASE BANK-END-TO-END-RECONCILIATION-FLOW-UX-CORRECTION-001 — drawers bajo
 * chrome de Banco; Confirmar con recibo → movimiento exacto; foco deep-link.
 */

export type { UnifiedCaseStatus };

type CaseSummary = {
  clusterKey: string;
  payerDisplayName: string;
  suggestedClientId: string | null;
  suggestedClientName: string | null;
  evidence: "strong" | "probable" | "ambiguous" | "none";
  movementCount: number;
  duplicateExcludedCount: number;
  months: string[];
  currencies: string[];
  totalByCurrency: Record<string, number>;
  receiptsFoundCount: number;
  missingReceiptCount: number;
  alreadyIdentifiedCount: number;
  status: UnifiedCaseStatus;
  recommendedAction: string;
};

type ReceiptCandidate = { receiptId: string; amount: number; currency: string; date: string | null };

type CaseRow = {
  movementId: string;
  date: string;
  amount: number;
  currency: string;
  referenceMasked: string | null;
  clientLabel: string;
  invoiceContextLabel: string;
  status: Exclude<UnifiedCaseStatus, "revision_parcial"> | "duplicado";
  statusLabel: string;
  action: "confirmar_con_recibo" | "dejar_pendiente" | "buscar_cliente" | "elegir_cliente" | "ninguna";
  hasCompatibleReceipt: boolean;
  hasFinancialLink: boolean;
  alreadyIdentifiedClientId: string | null;
  canonicalMovementId: string | null;
  receiptCandidate: ReceiptCandidate | null;
  receiptCandidatesCount: number;
};

type CaseDetail = CaseSummary & { rows: CaseRow[]; batchEligibleMovementIds: string[] };

/** Hints opcionales del cluster para que el drawer enfocado no mienta durante loading. */
export type OpenReceiptHints = {
  expectedHasCompatibleReceipt?: boolean;
  clientLabel?: string;
};

/** Etiqueta honesta de recibo a nivel fila — nunca "no hay recibo" fuera de loading. */
function receiptColumnLabel(row: CaseRow): string {
  if (row.receiptCandidatesCount > 1) return "Varios recibos posibles";
  if (row.receiptCandidate || row.hasCompatibleReceipt) return "Recibo encontrado";
  return "Sin recibo";
}

const STATUS_FILTERS: Array<{ value: UnifiedCaseStatus | ""; label: string }> = [
  { value: "", label: "Todos" },
  { value: "listo_para_confirmar", label: "Listos para confirmar" },
  { value: "revision_parcial", label: "Revisión parcial" },
  { value: "falta_recibo", label: "Falta recibo" },
  { value: "requiere_revision", label: "Requieren revisión" },
  { value: "sin_cliente", label: "Sin cliente" },
  { value: "conciliado", label: "Conciliados" },
];

const STATUS_TONE: Record<UnifiedCaseStatus, string> = {
  sin_cliente: "text-[var(--copilot-muted)]",
  listo_para_confirmar: "text-[var(--copilot-success-text-strong)]",
  revision_parcial: "text-[var(--copilot-warning-text-strong)]",
  falta_recibo: "text-[var(--copilot-warning-text-strong)]",
  requiere_revision: "text-[var(--copilot-danger-text-strong)]",
  conciliado: "text-[var(--copilot-success-text-strong)]",
};

function formatAmount(totalByCurrency: Record<string, number>): string {
  return Object.entries(totalByCurrency)
    .map(([cur, amt]) => `${cur} ${amt.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`)
    .join(" · ");
}

function formatMonthRange(months: string[]): string {
  if (months.length === 0) return "—";
  if (months.length === 1) return months[0]!;
  return `${months[0]} – ${months[months.length - 1]}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, init);
    const json = (await res.json()) as { ok?: boolean; data?: T; error?: string };
    return { ok: Boolean(res.ok && json.ok), data: json.data, error: json.error };
  } catch {
    return { ok: false, error: "NETWORK_ERROR" };
  }
}

export function UnifiedReconciliationWorkspace({
  onChanged,
  onOpenIdentify,
  onOpenReceipt,
  initialClusterKey = null,
  initialMovementId = null,
  onInitialFocusConsumed,
  onCaseClosed,
}: {
  onChanged?: () => void;
  onOpenIdentify: (clusterKey: string) => void;
  onOpenReceipt: (movementId: string, hints?: OpenReceiptHints) => void;
  initialClusterKey?: string | null;
  initialMovementId?: string | null;
  onInitialFocusConsumed?: () => void;
  onCaseClosed?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UnifiedCaseStatus | "">("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openClusterKey, setOpenClusterKey] = useState<string | null>(null);
  const [highlightMovementId, setHighlightMovementId] = useState<string | null>(null);
  const [appliedFocusToken, setAppliedFocusToken] = useState<string | null>(null);

  const incomingFocusToken =
    initialClusterKey != null || initialMovementId != null
      ? `c:${initialClusterKey ?? ""}|m:${initialMovementId ?? ""}`
      : null;

  if (incomingFocusToken && incomingFocusToken !== appliedFocusToken) {
    setAppliedFocusToken(incomingFocusToken);
    if (initialClusterKey) setOpenClusterKey(initialClusterKey);
    setHighlightMovementId(initialMovementId);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [appliedFilters, setAppliedFilters] = useState({ search: debouncedSearch, status: statusFilter });
  if (appliedFilters.search !== debouncedSearch || appliedFilters.status !== statusFilter) {
    setAppliedFilters({ search: debouncedSearch, status: statusFilter });
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetchJson<{ cases: CaseSummary[]; total: number }>(
      `/api/copilot/bank-reconciliation/unified-cases?${params.toString()}`
    );
    if (!res.ok || !res.data) {
      setError(res.error ?? "No se pudieron cargar los casos de conciliación.");
      setCases([]);
      setTotal(0);
    } else {
      setCases(res.data.cases);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!appliedFocusToken) return;
    onInitialFocusConsumed?.();
  }, [appliedFocusToken, onInitialFocusConsumed]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const closeCase = () => {
    setOpenClusterKey(null);
    setHighlightMovementId(null);
    onCaseClosed?.();
  };

  return (
    <div className="space-y-3" data-bank-unified-workspace>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className={copilotMetricLabelClass}>Buscar cliente o pagador</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre…"
            className={copilotInputClass}
          />
        </div>
        <p className={`${copilotCaptionClass} ml-auto`}>{loading ? "Cargando…" : `${total} clientes`}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por estado de conciliación">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || "todos"}
            type="button"
            aria-pressed={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
            className={copilotButtonClassName({ variant: statusFilter === f.value ? "primary" : "ghost", size: "sm" })}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-[var(--copilot-danger-text-strong)]">{error}</p> : null}
      {!loading && cases.length === 0 && !error ? (
        <p className={`${copilotCaptionClass} px-1 py-6 text-center`}>No hay clientes con este filtro.</p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {cases.map((c) => (
          <CaseCard key={c.clusterKey} unifiedCase={c} onOpen={() => setOpenClusterKey(c.clusterKey)} />
        ))}
      </ul>

      {total > pageSize ? (
        <nav className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            Anterior
          </button>
          <span className={copilotCaptionClass}>
            Página {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            Siguiente
          </button>
        </nav>
      ) : null}

      {openClusterKey ? (
        <UnifiedCaseDrawer
          clusterKey={openClusterKey}
          highlightMovementId={highlightMovementId}
          onClose={closeCase}
          onChanged={() => {
            void load();
            onChanged?.();
          }}
          onOpenIdentify={onOpenIdentify}
          onOpenReceipt={onOpenReceipt}
        />
      ) : null}
    </div>
  );
}

function CaseCard({ unifiedCase, onOpen }: { unifiedCase: CaseSummary; onOpen: () => void }) {
  const statusLabel = unifiedCaseStatusLabel(unifiedCase.status, {
    ready: unifiedCase.receiptsFoundCount,
    missing: unifiedCase.missingReceiptCount,
  });
  return (
    <li className={copilotCardStandardClass}>
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-soft-bg)] text-sm font-semibold text-[var(--copilot-text)]"
          aria-hidden
        >
          {unifiedCase.suggestedClientName?.[0]?.toUpperCase() ?? unifiedCase.payerDisplayName[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--copilot-text)]">
            {unifiedCase.suggestedClientName ?? unifiedCase.payerDisplayName}
          </p>
          {unifiedCase.suggestedClientName ? (
            <p className={`${copilotCaptionClass} truncate`}>Nombre bancario: {unifiedCase.payerDisplayName}</p>
          ) : null}
        </div>
      </div>

      <p className={`${copilotCaptionClass} mt-2`}>
        {unifiedCase.movementCount} movimiento{unifiedCase.movementCount === 1 ? "" : "s"} reales
        {unifiedCase.duplicateExcludedCount > 0
          ? ` · ${unifiedCase.duplicateExcludedCount} duplicado${unifiedCase.duplicateExcludedCount === 1 ? "" : "s"} excluido${unifiedCase.duplicateExcludedCount === 1 ? "" : "s"}`
          : ""}{" "}
        · {formatMonthRange(unifiedCase.months)}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--copilot-text)]">{formatAmount(unifiedCase.totalByCurrency)}</p>
      <p className={`${copilotCaptionClass} mt-1`}>
        {unifiedCase.receiptsFoundCount} listos para confirmar · {unifiedCase.missingReceiptCount} pendientes de recibo
      </p>

      <p className={`mt-2 text-sm font-medium ${STATUS_TONE[unifiedCase.status]}`}>{statusLabel}</p>

      <div className="mt-2">
        <button type="button" onClick={onOpen} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
          {unifiedCase.recommendedAction}
        </button>
      </div>
    </li>
  );
}

const ROW_ACTION_LABEL: Record<CaseRow["action"], string> = {
  confirmar_con_recibo: "Confirmar con recibo",
  dejar_pendiente: "Dejar pendiente",
  buscar_cliente: "Identificar cliente",
  elegir_cliente: "Elegir cliente",
  ninguna: "—",
};

function UnifiedCaseDrawer({
  clusterKey,
  highlightMovementId,
  onClose,
  onChanged,
  onOpenIdentify,
  onOpenReceipt,
}: {
  clusterKey: string;
  highlightMovementId?: string | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenIdentify: (clusterKey: string) => void;
  onOpenReceipt: (movementId: string, hints?: OpenReceiptHints) => void;
}) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(highlightMovementId ?? null);
  const [prevHighlightMovementId, setPrevHighlightMovementId] = useState(highlightMovementId);
  if (highlightMovementId !== prevHighlightMovementId) {
    setPrevHighlightMovementId(highlightMovementId);
    if (highlightMovementId) setFocusedRowId(highlightMovementId);
  }
  // FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — cola de revisión
  // "1 de N": al iniciar el lote de listos-para-confirmar, guardamos el orden
  // y la posición actual para mostrar progreso y navegar sin perder el lugar.
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchJson<CaseDetail>(
      `/api/copilot/bank-reconciliation/unified-cases/${encodeURIComponent(clusterKey)}`
    );
    if (!res.ok || !res.data) {
      setError(res.error ?? "No se pudo cargar el detalle de este cliente.");
      setLoading(false);
      return;
    }
    setDetail(res.data);
    setLoading(false);
  }, [clusterKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);


  const clientAlreadyIdentified =
    Boolean(detail?.suggestedClientId) && (detail?.alreadyIdentifiedCount ?? 0) > 0;

  const handleBatchIdentifyClients = async () => {
    if (!detail || !detail.suggestedClientId || detail.batchEligibleMovementIds.length === 0) return;
    if (clientAlreadyIdentified) return;
    setBatchSubmitting(true);
    setBatchError(null);
    const res = await fetchJson<{ createdCount: number }>("/api/copilot/bank-reconciliation/client-identifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientCompanyId: detail.suggestedClientId,
        movementIds: detail.batchEligibleMovementIds,
        reason: null,
        status: "identified",
      }),
    });
    setBatchSubmitting(false);
    if (!res.ok || !res.data) {
      setBatchError(res.error ?? "No se pudo confirmar el lote.");
      return;
    }
    setBatchResult(
      `Cliente confirmado para ${res.data.createdCount} movimiento${res.data.createdCount === 1 ? "" : "s"}.`
    );
    void load();
    onChanged();
  };

  const openReceiptWithHints = (movementId: string) => {
    const row = detail?.rows.find((r) => r.movementId === movementId);
    setFocusedRowId(movementId);
    onOpenReceipt(movementId, {
      expectedHasCompatibleReceipt: row?.hasCompatibleReceipt ?? true,
      clientLabel: row?.clientLabel ?? detail?.suggestedClientName ?? undefined,
    });
  };

  /** Arranca la cola de revisión con todos los movimientos listos para confirmar. */
  const startReviewQueue = () => {
    const queue = detail?.batchEligibleMovementIds ?? [];
    if (queue.length === 0) return;
    setReviewQueue(queue);
    setReviewIndex(0);
    openReceiptWithHints(queue[0]!);
  };

  const goToReviewIndex = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= reviewQueue.length) return;
    setReviewIndex(nextIndex);
    openReceiptWithHints(reviewQueue[nextIndex]!);
  };

  const focusedRow = detail?.rows.find((r) => r.movementId === focusedRowId) ?? null;

  return (
    <BankDrawerShell
      onBackdropClick={onClose}
      aria-label="Detalle de conciliación"
      panelClassName="w-full max-w-[820px]"
    >
      <BankDrawerHeader className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
        <div className="min-w-0">
          <p className={copilotCaptionClass}>Banco → Conciliación</p>
          <h3 className="truncate text-base font-semibold text-[var(--copilot-text)]">
            {detail?.suggestedClientName ?? detail?.payerDisplayName ?? "Detalle de conciliación"}
          </h3>
          {detail ? (
            <div className={`${copilotCaptionClass} mt-1 space-y-0.5`}>
              <p>
                {detail.movementCount} movimiento{detail.movementCount === 1 ? "" : "s"} reales
                {detail.duplicateExcludedCount > 0
                  ? ` · ${detail.duplicateExcludedCount} duplicado${detail.duplicateExcludedCount === 1 ? "" : "s"} excluido${detail.duplicateExcludedCount === 1 ? "" : "s"}`
                  : ""}
              </p>
              <p>
                {detail.receiptsFoundCount} listos para confirmar · {detail.missingReceiptCount} pendientes de recibo
              </p>
              <p className={STATUS_TONE[detail.status]}>
                {unifiedCaseStatusLabel(detail.status, {
                  ready: detail.receiptsFoundCount,
                  missing: detail.missingReceiptCount,
                })}
              </p>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
          Cerrar
        </button>
      </BankDrawerHeader>

      <BankDrawerBody className="p-5">
        {loading ? <p className={copilotCaptionClass}>Cargando movimientos…</p> : null}
        {error ? <p className="text-sm text-[var(--copilot-danger-text-strong)]">{error}</p> : null}

        {detail ? (
          <>
            <div className="flex flex-wrap gap-2">
              {detail.batchEligibleMovementIds.length >= 1 && clientAlreadyIdentified ? (
                <button
                  type="button"
                  onClick={startReviewQueue}
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  Revisar {detail.batchEligibleMovementIds.length} listos
                </button>
              ) : null}
              {detail.batchEligibleMovementIds.length >= 1 &&
              !clientAlreadyIdentified &&
              detail.suggestedClientId ? (
                <button
                  type="button"
                  disabled={batchSubmitting}
                  onClick={() => void handleBatchIdentifyClients()}
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  {batchSubmitting ? "Confirmando…" : "Confirmar cliente"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const first = detail.rows.find((r) => r.status !== "duplicado");
                  if (first) setFocusedRowId(first.movementId);
                }}
                className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              >
                Revisar uno por uno
              </button>
              <button
                type="button"
                onClick={() => onOpenIdentify(detail.clusterKey)}
                className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              >
                Cambiar cliente
              </button>
              {detail.suggestedClientId ? (
                <a
                  href={`/copilot/clientes/${encodeURIComponent(detail.suggestedClientId)}`}
                  className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                >
                  Ver ficha del cliente
                </a>
              ) : null}
            </div>

            {reviewQueue.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2">
                <p className="text-xs font-medium text-[var(--copilot-text)]" data-review-progress>
                  Revisando {reviewIndex + 1} de {reviewQueue.length}
                </p>
                <div className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    disabled={reviewIndex <= 0}
                    onClick={() => goToReviewIndex(reviewIndex - 1)}
                    className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={reviewIndex >= reviewQueue.length - 1}
                    onClick={() => goToReviewIndex(reviewIndex + 1)}
                    className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  >
                    Siguiente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewQueue([]);
                      setReviewIndex(0);
                    }}
                    className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  >
                    Salir de la revisión
                  </button>
                </div>
              </div>
            ) : null}

            <p className={`${copilotCaptionClass} mt-3`}>
              La corrección financiera todavía requiere revisión. Ocultar no modifica la conciliación.
            </p>

            {detail.evidence === "ambiguous" || detail.evidence === "none" ? (
              <div className="mt-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
                <p className="text-sm text-[var(--copilot-text)]">
                  {detail.evidence === "ambiguous"
                    ? "Más de un cliente podría corresponder a este pagador."
                    : "Todavía no encontramos un cliente candidato para este pagador."}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenIdentify(detail.clusterKey)}
                  className={`mt-2 ${copilotButtonClassName({ variant: "primary", size: "sm" })}`}
                >
                  Identificar cliente
                </button>
              </div>
            ) : null}

            {batchResult ? <p className="mt-3 text-sm text-[var(--copilot-success-text-strong)]">{batchResult}</p> : null}
            {batchError ? <p className="mt-3 text-sm text-[var(--copilot-danger-text-strong)]">{batchError}</p> : null}

            {focusedRow && focusedRow.status !== "duplicado" ? (
              <div
                className="mt-4 rounded-xl border-2 border-[var(--copilot-accent)] bg-[var(--copilot-soft-bg)] p-4"
                data-focused-movement={focusedRow.movementId}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
                  Movimiento en foco
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--copilot-text)]">
                  {focusedRow.date} · {focusedRow.currency} {focusedRow.amount.toLocaleString("es-UY")}
                  {focusedRow.referenceMasked ? ` · ${focusedRow.referenceMasked}` : ""}
                </p>
                <dl className="mt-2 grid gap-1 text-xs text-[var(--copilot-text)]">
                  <div>
                    <dt className="inline text-[var(--copilot-muted)]">Cliente · </dt>
                    <dd className="inline">{focusedRow.clientLabel}</dd>
                  </div>
                  <div>
                    <dt className="inline text-[var(--copilot-muted)]">Recibo · </dt>
                    <dd className="inline">
                      {focusedRow.hasCompatibleReceipt ? "Recibo compatible" : "Sin recibo en Zeta"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-[var(--copilot-muted)]">Factura · </dt>
                    <dd className="inline">{focusedRow.invoiceContextLabel}</dd>
                  </div>
                  <div>
                    <dt className="inline text-[var(--copilot-muted)]">Estado · </dt>
                    <dd className="inline">{focusedRow.statusLabel}</dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <UnifiedRowActions
                    row={focusedRow}
                    onIdentify={() => onOpenIdentify(detail.clusterKey)}
                    onReceipt={() => openReceiptWithHints(focusedRow.movementId)}
                    onFocus={() => setFocusedRowId(focusedRow.movementId)}
                  />
                </div>
              </div>
            ) : null}

            {(() => {
              const operationalRows = detail.rows.filter((r) => r.status !== "duplicado");
              const duplicateRows = detail.rows.filter((r) => r.status === "duplicado");
              return (
                <>
                  <p className={`${copilotCaptionClass} mt-4 font-medium text-[var(--copilot-text)]`}>
                    Movimientos operativos ({operationalRows.length})
                    {detail.duplicateExcludedCount > 0
                      ? ` · ${detail.duplicateExcludedCount} duplicado${detail.duplicateExcludedCount === 1 ? "" : "s"} excluido${detail.duplicateExcludedCount === 1 ? "" : "s"}`
                      : ""}
                  </p>

                  <div className="mt-2 space-y-3 md:hidden">
                    {operationalRows.map((row) => (
                      <div
                        key={row.movementId}
                        className={
                          focusedRowId === row.movementId || highlightMovementId === row.movementId
                            ? "rounded-xl ring-2 ring-[var(--copilot-accent)]"
                            : ""
                        }
                      >
                        <UnifiedRowCard
                          row={row}
                          onIdentify={() => onOpenIdentify(detail.clusterKey)}
                          onReceipt={() => openReceiptWithHints(row.movementId)}
                          onSelect={() => setFocusedRowId(row.movementId)}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 hidden overflow-x-auto md:block">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[var(--copilot-muted)]">
                          <th className="py-1 pr-2">Fecha</th>
                          <th className="py-1 pr-2">Movimiento</th>
                          <th className="py-1 pr-2">Recibo</th>
                          <th className="py-1 pr-2">Factura</th>
                          <th className="py-1 pr-2">Estado</th>
                          <th className="py-1">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operationalRows.map((row) => (
                          <tr
                            key={row.movementId}
                            className={`border-t border-[var(--copilot-border)] ${
                              focusedRowId === row.movementId || highlightMovementId === row.movementId
                                ? "bg-[var(--copilot-soft-bg)]"
                                : ""
                            }`}
                          >
                            <td className="py-1.5 pr-2 whitespace-nowrap">{row.date}</td>
                            <td className="py-1.5 pr-2 whitespace-nowrap">
                              {row.currency} {row.amount.toLocaleString("es-UY")}
                              {row.referenceMasked ? (
                                <span className={`block ${copilotCaptionClass}`}>{row.referenceMasked}</span>
                              ) : null}
                              <span className={`block ${copilotCaptionClass}`}>{row.clientLabel}</span>
                            </td>
                            <td className="py-1.5 pr-2">{receiptColumnLabel(row)}</td>
                            <td className="py-1.5 pr-2 max-w-[14rem]">{row.invoiceContextLabel}</td>
                            <td className="py-1.5 pr-2">{row.statusLabel}</td>
                            <td className="py-1.5">
                              <UnifiedRowActions
                                row={row}
                                onIdentify={() => onOpenIdentify(detail.clusterKey)}
                                onReceipt={() => openReceiptWithHints(row.movementId)}
                                onFocus={() => setFocusedRowId(row.movementId)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {duplicateRows.length > 0 ? (
                    <details className="mt-4 rounded-lg border border-[var(--copilot-border)] p-3">
                      <summary className="cursor-pointer text-sm font-medium text-[var(--copilot-text)]">
                        Duplicados excluidos ({duplicateRows.length})
                      </summary>
                      <ul className="mt-3 space-y-2">
                        {duplicateRows.map((row) => (
                          <li
                            key={row.movementId}
                            className={`${copilotCaptionClass} rounded-md bg-[var(--copilot-soft-bg)] p-2`}
                          >
                            <span className="font-medium text-[var(--copilot-text)]">Duplicado</span>
                            {" · "}
                            {row.date} · {row.currency} {row.amount.toLocaleString("es-UY")}
                            {row.referenceMasked ? ` · ${row.referenceMasked}` : ""}
                            {row.canonicalMovementId ? (
                              <span className="mt-0.5 block">Canónico: {row.canonicalMovementId.slice(0, 8)}…</span>
                            ) : null}
                            <span className="mt-0.5 block">Sin acción operativa · no entra al lote ni a totales</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </>
              );
            })()}

            {detail.rows.some((r) => r.hasFinancialLink) ? (
              <p className={`${copilotCaptionClass} mt-3`}>
                La corrección financiera todavía requiere revisión. No hay reversión segura desde esta pantalla.
              </p>
            ) : null}
          </>
        ) : null}
      </BankDrawerBody>
    </BankDrawerShell>
  );
}

function UnifiedRowActions({
  row,
  onIdentify,
  onReceipt,
  onFocus,
}: {
  row: CaseRow;
  onIdentify: () => void;
  onReceipt: () => void;
  onFocus?: () => void;
}) {
  if (row.status === "duplicado") {
    return <span className={copilotCaptionClass}>Ver evidencia (duplicado)</span>;
  }
  if (row.hasFinancialLink) {
    return (
      <button type="button" onClick={onFocus} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
        Ver conciliación
      </button>
    );
  }
  if (row.alreadyIdentifiedClientId) {
    return (
      <div className="flex flex-wrap gap-1">
        {row.action === "confirmar_con_recibo" ? (
          <button
            type="button"
            onClick={onReceipt}
            className={copilotButtonClassName({ variant: "primary", size: "sm" })}
          >
            Confirmar con recibo
          </button>
        ) : row.action === "dejar_pendiente" ? (
          <span className={copilotCaptionClass}>Dejar pendiente</span>
        ) : null}
        <button type="button" onClick={onIdentify} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
          Cambiar cliente
        </button>
      </div>
    );
  }
  if (row.action === "ninguna") {
    return <span className={copilotCaptionClass}>—</span>;
  }
  if (row.action === "dejar_pendiente") {
    return <span className={copilotCaptionClass}>{ROW_ACTION_LABEL[row.action]}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => (row.action === "confirmar_con_recibo" ? onReceipt() : onIdentify())}
      className={copilotButtonClassName({ variant: "primary", size: "sm" })}
    >
      {ROW_ACTION_LABEL[row.action]}
    </button>
  );
}

function UnifiedRowCard({
  row,
  onIdentify,
  onReceipt,
  onSelect,
}: {
  row: CaseRow;
  onIdentify: () => void;
  onReceipt: () => void;
  onSelect?: () => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--copilot-border)] p-3">
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--copilot-text)]">
              {row.currency} {row.amount.toLocaleString("es-UY")}
            </p>
            <p className={copilotCaptionClass}>
              {row.date}
              {row.referenceMasked ? ` · ${row.referenceMasked}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-xs font-medium text-[var(--copilot-text)]">{row.statusLabel}</p>
        </div>
      </button>
      <dl className="mt-2 grid gap-1 text-xs text-[var(--copilot-text)]">
        <div>
          <dt className="inline text-[var(--copilot-muted)]">Cliente · </dt>
          <dd className="inline">{row.clientLabel}</dd>
        </div>
        <div>
          <dt className="inline text-[var(--copilot-muted)]">Recibo · </dt>
          <dd className="inline">{receiptColumnLabel(row)}</dd>
        </div>
        <div>
          <dt className="inline text-[var(--copilot-muted)]">Factura · </dt>
          <dd className="inline">{row.invoiceContextLabel}</dd>
        </div>
      </dl>
      <div className="mt-2">
        <UnifiedRowActions row={row} onIdentify={onIdentify} onReceipt={onReceipt} onFocus={onSelect} />
      </div>
    </article>
  );
}
