"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotMetricLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { MOVEMENT_LEVEL_LABEL } from "@/lib/bank/canonical/movement-reconciliation-level-labels";

/**
 * FASE BANK-CLIENT-IDENTIFICATION-SCHEMA-APPLY-AND-BATCH-UI-001 — vista
 * "Identificar clientes" dentro de Banco → Conciliación. Agrupa transferencias
 * por pagador y permite confirmar en lote a qué cliente corresponden. NUNCA
 * crea recibos, links financieros, allocations ni facturas pagadas — eso
 * sigue siendo responsabilidad exclusiva de "Vincular recibos".
 *
 * Performance: clusters paginados/buscados server-side; el detalle de
 * movimientos de un cluster se carga lazy recién al abrir el drawer.
 */

type EvidenceLevel = "strong" | "probable" | "ambiguous" | "none";

type ClientMatch = { clientCompanyId: string; clientName: string; matchType: "exact" | "contains" };

type ClusterSummary = {
  clusterKey: string;
  displayName: string;
  months: string[];
  currencies: string[];
  totalByCurrency: Record<string, number>;
  movementCount: number;
  clientMatches: ClientMatch[];
  evidence: EvidenceLevel;
  compatibleReceiptCount: number;
  missingReceiptCount: number;
  alreadyIdentifiedCount: number;
};

type IdentificationLevel =
  | "unidentified"
  | "client_identified"
  | "missing_receipt"
  | "reconciled_with_receipt"
  | "full_reconciliation";

type ClusterMovement = {
  movementId: string;
  date: string;
  amount: number;
  currency: string;
  referenceMasked: string | null;
  hasCompatibleReceipt: boolean;
  hasFinancialLink: boolean;
  alreadyIdentifiedClientId: string | null;
  level: IdentificationLevel;
};

type ClusterDetail = ClusterSummary & { movements: ClusterMovement[] };

const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  strong: "Coincidencia fuerte",
  probable: "Coincidencia probable",
  ambiguous: "Ambigua",
  none: "Sin candidato",
};

const EVIDENCE_TONE: Record<EvidenceLevel, string> = {
  strong: "text-[var(--copilot-success-text-strong)]",
  probable: "text-[var(--copilot-warning-text-strong)]",
  ambiguous: "text-[var(--copilot-danger-text-strong)]",
  none: "text-[var(--copilot-muted)]",
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

export function BankClientIdentificationWorkspace({ onChanged }: { onChanged?: () => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceLevel | "">("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerKey, setDrawerKey] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Resetea la página al cambiar filtros — ajuste de estado durante el render
  // (patrón recomendado por React para "adjusting state when a prop/state
  // changes"), no en un efecto, para no encadenar renders innecesarios.
  const [appliedFilters, setAppliedFilters] = useState({ search: debouncedSearch, evidence: evidenceFilter });
  if (appliedFilters.search !== debouncedSearch || appliedFilters.evidence !== evidenceFilter) {
    setAppliedFilters({ search: debouncedSearch, evidence: evidenceFilter });
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (evidenceFilter) params.set("evidence", evidenceFilter);
    const res = await fetchJson<{ clusters: ClusterSummary[]; total: number }>(
      `/api/copilot/bank-reconciliation/payer-clusters?${params.toString()}`
    );
    if (!res.ok || !res.data) {
      setError(res.error ?? "No se pudieron cargar las identidades de pagador.");
      setClusters([]);
      setTotal(0);
    } else {
      setClusters(res.data.clusters);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [page, debouncedSearch, evidenceFilter]);

  useEffect(() => {
    // Fetch-on-mount/filter-change: el estado se sincroniza desde una fuente externa (API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className={copilotMetricLabelClass}>Buscar pagador</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre del pagador…"
            className={copilotInputClass}
          />
        </div>
        <div>
          <label className={copilotMetricLabelClass}>Evidencia</label>
          <select
            value={evidenceFilter}
            onChange={(e) => setEvidenceFilter(e.target.value as EvidenceLevel | "")}
            className={copilotInputClass}
          >
            <option value="">Todas</option>
            <option value="strong">Coincidencia fuerte</option>
            <option value="probable">Coincidencia probable</option>
            <option value="ambiguous">Ambigua</option>
            <option value="none">Sin cliente sugerido</option>
          </select>
        </div>
        <p className={`${copilotCaptionClass} ml-auto`}>
          {loading ? "Cargando…" : `${total} identidades de pagador`}
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--copilot-danger-text-strong)]">{error}</p> : null}

      {!loading && clusters.length === 0 && !error ? (
        <p className={`${copilotCaptionClass} px-1 py-6 text-center`}>No hay identidades de pagador con estos filtros.</p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {clusters.map((cluster) => (
          <ClusterCard
            key={cluster.clusterKey}
            cluster={cluster}
            onReview={() => setDrawerKey(cluster.clusterKey)}
          />
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

      {drawerKey ? (
        <ClusterReviewDrawer
          clusterKey={drawerKey}
          onClose={() => setDrawerKey(null)}
          onConfirmed={() => {
            setDrawerKey(null);
            void load();
            onChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}

function ClusterCard({ cluster, onReview }: { cluster: ClusterSummary; onReview: () => void }) {
  const suggested = cluster.clientMatches.length === 1 ? cluster.clientMatches[0]! : null;
  const ambiguous = cluster.clientMatches.length > 1;

  return (
    <li className={copilotCardStandardClass}>
      <p className="text-sm font-semibold text-[var(--copilot-text)]">{cluster.displayName}</p>
      <p className={copilotCaptionClass}>
        {cluster.movementCount} transferencia{cluster.movementCount === 1 ? "" : "s"} · {formatMonthRange(cluster.months)}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--copilot-text)]">{formatAmount(cluster.totalByCurrency)}</p>

      <div className="mt-2">
        <p className={copilotMetricLabelClass}>Cliente {ambiguous ? "(ambiguo)" : "sugerido"}</p>
        <p className="text-sm font-medium text-[var(--copilot-text)]">
          {suggested ? suggested.clientName : ambiguous ? cluster.clientMatches.map((m) => m.clientName).join(" / ") : "Sin candidato"}
        </p>
        <p className={`${copilotCaptionClass} ${EVIDENCE_TONE[cluster.evidence]}`}>{EVIDENCE_LABEL[cluster.evidence]}</p>
      </div>

      <p className={`${copilotCaptionClass} mt-1`}>
        {cluster.compatibleReceiptCount} con recibo · {cluster.missingReceiptCount} sin recibo en Zeta
        {cluster.alreadyIdentifiedCount > 0 ? ` · ${cluster.alreadyIdentifiedCount} ya identificados` : ""}
      </p>

      <div className="mt-2">
        <button type="button" onClick={onReview} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
          Revisar {cluster.movementCount} movimiento{cluster.movementCount === 1 ? "" : "s"}
        </button>
      </div>
    </li>
  );
}

type BatchMode = "identified" | "shared_account" | "third_party";
type ClientOption = { id: string; name: string };

function ClusterReviewDrawer({
  clusterKey,
  onClose,
  onConfirmed,
}: {
  clusterKey: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [mode, setMode] = useState<BatchMode>("identified");
  const [reason, setReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    createdCount: number;
    alreadyIdentifiedSameClient: string[];
    conflicts: Array<{ movementId: string; existingClientCompanyId: string }>;
    blockedNonInflow: string[];
    alreadyReconciled: string[];
  } | null>(null);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedForKey = useRef<string | null>(null);

  const loadDetail = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    const res = await fetchJson<ClusterDetail>(
      `/api/copilot/bank-reconciliation/payer-clusters/${encodeURIComponent(key)}`
    );
    if (loadedForKey.current !== key) return; // el drawer cambió de cluster mientras cargaba
    if (!res.ok || !res.data) {
      setError(res.error ?? "No se pudo cargar el detalle del cluster.");
      setLoading(false);
      return;
    }
    setDetail(res.data);
    // Preseleccionar todos los movimientos que aún no tienen conciliación ni identificación.
    const selectable = res.data.movements.filter(
      (m) => m.level !== "full_reconciliation" && m.level !== "reconciled_with_receipt"
    );
    setSelected(new Set(selectable.map((m) => m.movementId)));
    if (res.data.clientMatches.length === 1) {
      setClientId(res.data.clientMatches[0]!.clientCompanyId);
      setClientName(res.data.clientMatches[0]!.clientName);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadedForKey.current = clusterKey;
    // Fetch-on-open: el estado se sincroniza desde una fuente externa (API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetail(clusterKey);
    return () => {
      loadedForKey.current = null;
    };
  }, [clusterKey, loadDetail]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "10" });
      if (clientQuery.trim()) params.set("q", clientQuery.trim());
      const res = await fetchJson<ClientOption[]>(
        `/api/copilot/bank-reconciliation/clients-search?${params.toString()}`
      );
      if (res.ok && res.data) setClientOptions(res.data);
    }, 250);
  }, [clientQuery, pickerOpen]);

  const toggleMovement = (movementId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(movementId)) next.delete(movementId);
      else next.add(movementId);
      return next;
    });
  };

  const selectableMovements = (detail?.movements ?? []).filter(
    (m) => m.level !== "full_reconciliation" && m.level !== "reconciled_with_receipt"
  );

  const handleConfirm = async () => {
    if (!clientId || selected.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await fetchJson<{
      createdCount: number;
      alreadyIdentifiedSameClient: string[];
      conflicts: Array<{ movementId: string; existingClientCompanyId: string }>;
      blockedNonInflow: string[];
      alreadyReconciled: string[];
    }>("/api/copilot/bank-reconciliation/client-identifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientCompanyId: clientId,
        movementIds: Array.from(selected),
        reason: reason.trim() || null,
        status: mode,
      }),
    });
    setSubmitting(false);
    if (!res.ok || !res.data) {
      setSubmitError(res.error ?? "No se pudo confirmar la identificación.");
      return;
    }
    setSummary(res.data);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-[var(--copilot-card-bg)] p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--copilot-text)]">
            {detail?.displayName ?? "Revisar movimientos"}
          </h3>
          <button type="button" onClick={onClose} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
            Cerrar
          </button>
        </div>

        {loading ? <p className={`${copilotCaptionClass} mt-4`}>Cargando movimientos…</p> : null}
        {error ? <p className="mt-4 text-sm text-[var(--copilot-danger-text-strong)]">{error}</p> : null}

        {summary ? (
          <div className="mt-4 space-y-2 rounded-lg border border-[var(--copilot-border)] p-3">
            <p className="text-sm font-medium text-[var(--copilot-success-text-strong)]">
              {summary.createdCount} movimiento{summary.createdCount === 1 ? "" : "s"} identificado
              {summary.createdCount === 1 ? "" : "s"} para {clientName || "el cliente elegido"}.
            </p>
            {summary.alreadyIdentifiedSameClient.length > 0 ? (
              <p className={copilotCaptionClass}>{summary.alreadyIdentifiedSameClient.length} ya estaban identificados (idempotente, sin duplicar).</p>
            ) : null}
            {summary.conflicts.length > 0 ? (
              <p className="text-sm text-[var(--copilot-warning-text-strong)]">
                {summary.conflicts.length} movimiento(s) ya tenían otro cliente identificado — no se sobrescribieron.
              </p>
            ) : null}
            {summary.blockedNonInflow.length > 0 ? (
              <p className={copilotCaptionClass}>{summary.blockedNonInflow.length} eran egresos y se ignoraron.</p>
            ) : null}
            {summary.alreadyReconciled.length > 0 ? (
              <p className={copilotCaptionClass}>{summary.alreadyReconciled.length} ya estaban conciliados financieramente.</p>
            ) : null}
            <button type="button" onClick={onConfirmed} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
              Listo
            </button>
          </div>
        ) : null}

        {detail && !summary ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--copilot-muted)]">
                    <th className="w-8" />
                    <th className="py-1">Fecha</th>
                    <th className="py-1">Importe</th>
                    <th className="py-1">Referencia</th>
                    <th className="py-1">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.movements.map((m) => {
                    const locked = m.level === "full_reconciliation" || m.level === "reconciled_with_receipt";
                    return (
                      <tr key={m.movementId} className="border-t border-[var(--copilot-border)]">
                        <td className="py-1">
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={selected.has(m.movementId)}
                            onChange={() => toggleMovement(m.movementId)}
                          />
                        </td>
                        <td className="py-1">{m.date}</td>
                        <td className="py-1">
                          {m.currency} {m.amount.toLocaleString("es-UY")}
                        </td>
                        <td className="py-1">{m.referenceMasked ?? "—"}</td>
                        <td className="py-1">{MOVEMENT_LEVEL_LABEL[m.level as keyof typeof MOVEMENT_LEVEL_LABEL] ?? m.level}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectableMovements.length === 0 ? (
                <p className={`${copilotCaptionClass} mt-2`}>
                  Todos los movimientos de este pagador ya están conciliados financieramente.
                </p>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className={copilotMetricLabelClass}>Cliente</label>
                {clientId ? (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--copilot-text)]">{clientName}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setClientId(null);
                        setClientName("");
                        setPickerOpen(true);
                      }}
                      className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                    >
                      Elegir otro cliente
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="search"
                      value={clientQuery}
                      onChange={(e) => {
                        setClientQuery(e.target.value);
                        setPickerOpen(true);
                      }}
                      placeholder="Buscar cliente…"
                      className={copilotInputClass}
                    />
                    {pickerOpen && clientOptions.length > 0 ? (
                      <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--copilot-border)]">
                        {clientOptions.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setClientId(c.id);
                                setClientName(c.name);
                                setPickerOpen(false);
                              }}
                              className="w-full px-2 py-1 text-left text-sm hover:bg-[var(--copilot-hover-bg)]"
                            >
                              {c.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>

              <div>
                <label className={copilotMetricLabelClass}>Modalidad</label>
                <select value={mode} onChange={(e) => setMode(e.target.value as BatchMode)} className={copilotInputClass}>
                  <option value="identified">Identificación normal</option>
                  <option value="shared_account">Cuenta compartida</option>
                  <option value="third_party">Pago de tercero</option>
                </select>
              </div>

              <div>
                <label className={copilotMetricLabelClass}>Motivo (opcional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className={copilotInputClass}
                  placeholder="Ej: razón social exacta, mismo patrón mensual…"
                />
              </div>

              <p className={copilotCaptionClass}>
                Se identificarán {selected.size} movimiento{selected.size === 1 ? "" : "s"} como{" "}
                {clientName || "(elegí un cliente)"}. Ningún recibo ni factura será modificado.
              </p>

              {submitError ? <p className="text-sm text-[var(--copilot-danger-text-strong)]">{submitError}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!clientId || selected.size === 0 || submitting}
                  onClick={handleConfirm}
                  className={copilotButtonClassName({ variant: "primary", size: "sm" })}
                >
                  {submitting ? "Confirmando…" : "Confirmar lote"}
                </button>
                <button type="button" onClick={onClose} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
                  Dejar pendiente
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
