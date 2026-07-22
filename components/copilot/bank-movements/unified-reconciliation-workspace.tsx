"use client";

import { useCallback, useEffect, useState } from "react";

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
 * FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001 — reemplaza los dos
 * pasos manuales de Conciliación ("Identificar clientes" / "Vincular
 * recibos") por una única vista: tarjetas por cliente/pagador con un estado
 * y una acción claros, y una tabla de detalle Fecha|Banco|Recibo|Factura|
 * Estado|Acción por movimiento.
 *
 * Es una capa de lectura sobre lib/bank/canonical/unified-reconciliation-case.ts
 * (que a su vez compone los motores YA existentes de clustering/identificación
 * y auditoría de duplicados). Las acciones reales (identificar cliente,
 * vincular recibo) delegan en los flujos existentes ya probados — este
 * componente nunca escribe directamente en identificaciones de cliente
 * ni en vínculos financieros canónicos.
 */

export type { UnifiedCaseStatus };

type CaseSummary = {
  clusterKey: string;
  payerDisplayName: string;
  suggestedClientId: string | null;
  suggestedClientName: string | null;
  evidence: "strong" | "probable" | "ambiguous" | "none";
  movementCount: number;
  months: string[];
  currencies: string[];
  totalByCurrency: Record<string, number>;
  receiptsFoundCount: number;
  missingReceiptCount: number;
  alreadyIdentifiedCount: number;
  status: UnifiedCaseStatus;
  recommendedAction: string;
};

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
};

type CaseDetail = CaseSummary & { rows: CaseRow[]; batchEligibleMovementIds: string[] };

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
}: {
  onChanged?: () => void;
  /** Abre el flujo existente de identificación en lote (ClusterReviewDrawer) para este cluster. */
  onOpenIdentify: (clusterKey: string) => void;
  /** Abre el flujo existente de búsqueda de recibo (BankIncomeWorkspace) para este movimiento. */
  onOpenReceipt: (movementId: string) => void;
  /** Deep-link desde Movimientos: abre el caso exacto en la vista unificada. */
  initialClusterKey?: string | null;
  initialMovementId?: string | null;
  onInitialFocusConsumed?: () => void;
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
    initialClusterKey != null ? `c:${initialClusterKey}|m:${initialMovementId ?? ""}` : null;

  if (incomingFocusToken && incomingFocusToken !== appliedFocusToken) {
    setAppliedFocusToken(incomingFocusToken);
    setOpenClusterKey(initialClusterKey);
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
    // Fetch-on-mount/filter-change: el estado se sincroniza desde una fuente externa (API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!appliedFocusToken) return;
    onInitialFocusConsumed?.();
  }, [appliedFocusToken, onInitialFocusConsumed]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
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
          onClose={() => {
            setOpenClusterKey(null);
            setHighlightMovementId(null);
          }}
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
        {unifiedCase.movementCount} transferencia{unifiedCase.movementCount === 1 ? "" : "s"} · {formatMonthRange(unifiedCase.months)}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--copilot-text)]">{formatAmount(unifiedCase.totalByCurrency)}</p>
      <p className={`${copilotCaptionClass} mt-1`}>
        {unifiedCase.receiptsFoundCount} con recibo · {unifiedCase.missingReceiptCount} sin recibo
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
  buscar_cliente: "Buscar cliente",
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
  onOpenReceipt: (movementId: string) => void;
}) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchJson<CaseDetail>(`/api/copilot/bank-reconciliation/unified-cases/${encodeURIComponent(clusterKey)}`);
    if (!res.ok || !res.data) {
      setError(res.error ?? "No se pudo cargar el detalle de este cliente.");
      setLoading(false);
      return;
    }
    setDetail(res.data);
    setLoading(false);
  }, [clusterKey]);

  useEffect(() => {
    // Fetch-on-open: el estado se sincroniza desde una fuente externa (API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleBatchConfirmClients = async () => {
    if (!detail || !detail.suggestedClientId || detail.batchEligibleMovementIds.length === 0) return;
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
    setBatchResult(`Cliente confirmado para ${res.data.createdCount} movimiento${res.data.createdCount === 1 ? "" : "s"}.`);
    void load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[var(--copilot-card-bg)] p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--copilot-text)]">
              {detail?.suggestedClientName ?? detail?.payerDisplayName ?? "Detalle de conciliación"}
            </h3>
            {detail ? (
              <p className={copilotCaptionClass}>
                {unifiedCaseStatusLabel(detail.status, {
                  ready: detail.receiptsFoundCount,
                  missing: detail.missingReceiptCount,
                })}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Cerrar
          </button>
        </div>

        {loading ? <p className={`${copilotCaptionClass} mt-4`}>Cargando movimientos…</p> : null}
        {error ? <p className="mt-4 text-sm text-[var(--copilot-danger-text-strong)]">{error}</p> : null}

        {detail ? (
          <>
            <p className={`${copilotCaptionClass} mt-3`}>
              Para corregir una conciliación financiera, usá el flujo de revisión. Ocultar no modifica la conciliación.
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
                  Elegir cliente
                </button>
              </div>
            ) : null}

            {batchResult ? <p className="mt-3 text-sm text-[var(--copilot-success-text-strong)]">{batchResult}</p> : null}
            {batchError ? <p className="mt-3 text-sm text-[var(--copilot-danger-text-strong)]">{batchError}</p> : null}

            {detail.batchEligibleMovementIds.length >= 1 && detail.suggestedClientId ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--copilot-border)] p-3">
                <p className="text-sm text-[var(--copilot-text)]">
                  Lote elegible: {detail.batchEligibleMovementIds.length} con recibo (no incluye pendientes de recibo).
                </p>
                <button
                  type="button"
                  disabled={batchSubmitting}
                  onClick={handleBatchConfirmClients}
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  {batchSubmitting ? "Confirmando…" : `Confirmar cliente en ${detail.batchEligibleMovementIds.length}`}
                </button>
              </div>
            ) : null}

            <div className="mt-4 space-y-3 md:hidden">
              {detail.rows.map((row) => (
                <div
                  key={row.movementId}
                  className={highlightMovementId === row.movementId ? "rounded-xl ring-2 ring-[var(--copilot-accent)]" : ""}
                >
                  <UnifiedRowCard
                    row={row}
                    onIdentify={() => onOpenIdentify(detail.clusterKey)}
                    onReceipt={() => onOpenReceipt(row.movementId)}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--copilot-muted)]">
                    <th className="py-1 pr-2">Fecha</th>
                    <th className="py-1 pr-2">Banco</th>
                    <th className="py-1 pr-2">Cliente</th>
                    <th className="py-1 pr-2">Recibo</th>
                    <th className="py-1 pr-2">Factura</th>
                    <th className="py-1 pr-2">Estado</th>
                    <th className="py-1">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((row) => (
                    <tr
                      key={row.movementId}
                      className={`border-t border-[var(--copilot-border)] ${
                        highlightMovementId === row.movementId ? "bg-[var(--copilot-soft-bg)]" : ""
                      }`}
                    >
                      <td className="py-1.5 pr-2 whitespace-nowrap">{row.date}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {row.currency} {row.amount.toLocaleString("es-UY")}
                        {row.referenceMasked ? (
                          <span className={`block ${copilotCaptionClass}`}>{row.referenceMasked}</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-2">{row.clientLabel}</td>
                      <td className="py-1.5 pr-2">{row.hasCompatibleReceipt ? "Recibo encontrado" : "Sin recibo"}</td>
                      <td className="py-1.5 pr-2">{row.invoiceContextLabel}</td>
                      <td className="py-1.5 pr-2">{row.statusLabel}</td>
                      <td className="py-1.5">
                        <UnifiedRowActions
                          row={row}
                          onIdentify={() => onOpenIdentify(detail.clusterKey)}
                          onReceipt={() => onOpenReceipt(row.movementId)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.rows.some((r) => r.hasFinancialLink) ? (
              <p className={`${copilotCaptionClass} mt-3`}>
                Revertir una conciliación financiera ya confirmada todavía no está disponible desde esta pantalla.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function UnifiedRowActions({
  row,
  onIdentify,
  onReceipt,
}: {
  row: CaseRow;
  onIdentify: () => void;
  onReceipt: () => void;
}) {
  if (row.status === "duplicado") {
    return <span className={copilotCaptionClass}>Sin acción operativa</span>;
  }
  if (row.hasFinancialLink) {
    return (
      <button
        type="button"
        disabled
        title="La reversión financiera todavía no tiene un contrato seguro en la UI"
        className="cursor-not-allowed text-[var(--copilot-muted)] opacity-60"
      >
        Revertir (próximamente)
      </button>
    );
  }
  if (row.alreadyIdentifiedClientId) {
    return (
      <div className="flex flex-wrap gap-1">
        {row.action === "confirmar_con_recibo" ? (
          <button type="button" onClick={onReceipt} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Confirmar con recibo
          </button>
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
      className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
    >
      {ROW_ACTION_LABEL[row.action]}
    </button>
  );
}

function UnifiedRowCard({
  row,
  onIdentify,
  onReceipt,
}: {
  row: CaseRow;
  onIdentify: () => void;
  onReceipt: () => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--copilot-border)] p-3">
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
      <dl className="mt-2 grid gap-1 text-xs text-[var(--copilot-text)]">
        <div>
          <dt className="inline text-[var(--copilot-muted)]">Cliente · </dt>
          <dd className="inline">{row.clientLabel}</dd>
        </div>
        <div>
          <dt className="inline text-[var(--copilot-muted)]">Recibo · </dt>
          <dd className="inline">{row.hasCompatibleReceipt ? "Recibo encontrado" : "Sin recibo"}</dd>
        </div>
        <div>
          <dt className="inline text-[var(--copilot-muted)]">Factura · </dt>
          <dd className="inline">{row.invoiceContextLabel}</dd>
        </div>
      </dl>
      <div className="mt-2">
        <UnifiedRowActions row={row} onIdentify={onIdentify} onReceipt={onReceipt} />
      </div>
    </article>
  );
}
