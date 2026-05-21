"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotClientEvidenceDrawer } from "@/components/copilot/copilot-client-evidence-drawer";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotGhostLink,
  CopilotSectionTitle,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import { CopilotSkeletonTable } from "@/components/copilot/copilot-loading-skeleton";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import {
  formatMoneyPortfolio,
  type ClientCompanyDetail,
  type ClientPortfolioLoad,
} from "@/lib/copilot-clients-portfolio";

function riskTone(r: ClientPortfolioRow["risk"]) {
  if (r === "Alto") return "text-rose-800 bg-rose-100/80";
  if (r === "Medio") return "text-amber-900 bg-amber-100/80";
  return "text-emerald-900 bg-emerald-100/80";
}

function shareLabel(sharePct: number): string {
  return `${(sharePct * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

type ClientListFilter = "all" | "with_debt" | "without_debt" | "no_contact" | "high_risk" | "recent_activity";

const FILTER_OPTIONS: Array<{ id: ClientListFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "with_debt", label: "Con deuda" },
  { id: "without_debt", label: "Sin deuda" },
  { id: "no_contact", label: "Sin contacto" },
  { id: "high_risk", label: "Riesgo alto" },
];

function matchesClientFilter(row: ClientPortfolioRow, filter: ClientListFilter): boolean {
  if (filter === "with_debt") return row.total_debt > 0;
  if (filter === "without_debt") return row.total_debt <= 0;
  if (filter === "no_contact") return !row.has_contact_data;
  if (filter === "high_risk") return row.risk === "Alto";
  if (filter === "recent_activity") return row.invoices_count > 0 || row.receipts_count > 0;
  return true;
}

export default function CopilotClientesPage() {
  const [load, setLoad] = useState<ClientPortfolioLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<ClientListFilter>("all");

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchClientPortfolioLoad();
      setLoad(data);
      setSelectedId((prev) => {
        if (prev && data.rows.some((r) => r.company_id === prev)) return prev;
        return data.rows[0]?.company_id ?? null;
      });
    } catch (e) {
      setLoad(null);
      setSelectedId(null);
      setError(
        e instanceof Error ? e.message : "No se pudo cargar la cartera desde Supabase."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Deep link desde Copilot (`/copilot/clientes?c=<company_id>`). */
  useEffect(() => {
    if (!load || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c && load.rows.some((r) => r.company_id === c)) {
      setSelectedId(c);
      setIsEvidenceOpen(true);
    }
  }, [load]);

  const visibleRows = useMemo(() => {
    if (!load) return [];
    return load.rows.filter((row) => matchesClientFilter(row, clientFilter));
  }, [load, clientFilter]);

  const activeDetail: ClientCompanyDetail | null = useMemo(() => {
    if (!load || !selectedId) return null;
    return load.details[selectedId] ?? null;
  }, [load, selectedId]);

  const openClient = (companyId: string) => {
    setSelectedId(companyId);
    setIsEvidenceOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Clientes"
        description="Cartera comercial desde empresas (proto_companies), facturas y recibos — facturación, deuda y riesgo en lenguaje de negocio."
      />

      <div className={copilotPageMainClass}>
        {loading ? (
          <CopilotSkeletonTable rows={6} columns={5} />
        ) : null}

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            {error}
          </div>
        ) : null}

        {!loading && !error && load ? (
          <>
            {/* Summary cards */}
            {(() => {
              const highRiskCount = load.rows.filter((r) => r.risk === "Alto").length;
              const noContactCount = load.rows.filter((r) => !r.has_contact_data).length;
              const withDebtCount = load.rows.filter((r) => r.total_debt > 0).length;
              return (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <CopilotCard className="py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Principales clientes
                    </p>
                    <p className="mt-1 text-sm leading-snug text-[var(--copilot-ink)]">
                      {load.summary.top_clients_line}
                    </p>
                  </CopilotCard>
                  <CopilotCard className="py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Con deuda activa
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--copilot-ink)]">
                      {withDebtCount}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                      {load.summary.debt_clients_line}
                    </p>
                  </CopilotCard>
                  <CopilotCard className={`py-3 ${highRiskCount > 0 ? "border-rose-200/80 bg-rose-50/40" : ""}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Riesgo alto
                    </p>
                    <p className={`mt-1 text-2xl font-bold tabular-nums ${highRiskCount > 0 ? "text-rose-700" : "text-[var(--copilot-ink)]"}`}>
                      {highRiskCount}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                      {load.summary.concentration_line}
                    </p>
                  </CopilotCard>
                  <CopilotCard className={`py-3 ${noContactCount > 0 ? "border-amber-200/80 bg-amber-50/40" : ""}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Sin contacto registrado
                    </p>
                    <p className={`mt-1 text-2xl font-bold tabular-nums ${noContactCount > 0 ? "text-amber-700" : "text-[var(--copilot-ink)]"}`}>
                      {noContactCount}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                      {noContactCount === 0
                        ? "Todos los clientes tienen contacto"
                        : "Clientes sin datos de contacto en Copilot"}
                    </p>
                  </CopilotCard>
                </div>
              );
            })()}

            {load.directory_diagnostics &&
            (load.directory_diagnostics.debtors_missing_company_row > 0 ||
              load.directory_diagnostics.debtors_inactive_company_row > 0) ? (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
                Se incorporaron clientes con deuda en facturas que no figuraban solo en empresas
                activas (
                {load.directory_diagnostics.debtors_missing_company_row} derivados de facturación,{" "}
                {load.directory_diagnostics.debtors_inactive_company_row} inactivos en
                proto_companies).
              </div>
            ) : null}

            <CopilotCard className="overflow-hidden p-0">
              <div className="border-b border-[var(--copilot-border)] px-4 py-3">
                <CopilotSectionTitle
                  title="Cartera activa"
                  subtitle="Directorio unificado: empresas + deudores en facturas (misma base que Cartera)."
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {FILTER_OPTIONS.map((opt) => {
                    const active = clientFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setClientFilter(opt.id)}
                        className={[
                          "rounded-full px-3 py-1 text-xs font-medium transition",
                          active
                            ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                            : "bg-white/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  <span className="self-center text-[11px] text-[var(--copilot-ink-muted)]">
                    {visibleRows.length} de {load.rows.length} visibles
                  </span>
                </div>
              </div>
              {load.rows.length === 0 ? (
                <p className="px-4 py-5 text-sm text-[var(--copilot-ink-muted)]">
                  No hay empresas en proto_companies. Importá o cargá empresas en Supabase para ver
                  la cartera.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-4 py-2">Empresa</th>
                        <th className="px-4 py-2">Industria</th>
                        <th className="px-4 py-2">Facturación</th>
                        <th className="px-4 py-2">Deuda</th>
                        <th className="px-4 py-2">Riesgo</th>
                        <th className="px-4 py-2">Participación</th>
                        <th className="px-4 py-2">Contacto</th>
                        <th className="px-4 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, i) => {
                        const isSelected = row.company_id === selectedId;
                        const evidenceOpenForRow = isEvidenceOpen && isSelected;
                        return (
                          <tr
                            key={row.company_id}
                            className={`border-b border-[var(--copilot-border)] transition last:border-b-0 hover:bg-[var(--copilot-accent-soft)]/50 ${
                              i % 2 === 0
                                ? "bg-[var(--copilot-card)]"
                                : "bg-[rgba(255,255,255,0.5)]"
                            } ${evidenceOpenForRow ? "ring-1 ring-inset ring-[rgba(31,107,74,0.25)]" : ""}`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <CopilotInteractiveText
                                  icon="chevron"
                                  className="font-semibold"
                                  onClick={() => openClient(row.company_id)}
                                >
                                  {row.name}
                                </CopilotInteractiveText>
                                {row.total_debt > 0 ? (
                                  <span className="inline-block rounded-full border border-rose-200/70 bg-rose-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-rose-800">
                                    Con deuda
                                  </span>
                                ) : null}
                                {row.derived_from_debt ? (
                                  <span className="inline-block rounded-full border border-amber-200/70 bg-amber-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-900">
                                    Derivado de facturación
                                  </span>
                                ) : null}
                                {!row.has_contact_data ? (
                                  <span className="inline-block rounded-full border border-[var(--copilot-border)] bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
                                    Sin dato de contacto
                                  </span>
                                ) : null}
                                {evidenceOpenForRow ? (
                                  <span className="inline-block rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
                                    Respaldo abierto
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="max-w-[200px] px-5 py-3.5 text-[var(--copilot-ink-muted)]">
                              <span className="line-clamp-2">{row.industry}</span>
                            </td>
                            <td className="px-5 py-3.5 tabular-nums text-[var(--copilot-ink-muted)]">
                              {formatMoneyPortfolio(row.total_billing)}
                            </td>
                            <td className="px-5 py-3.5 tabular-nums text-[var(--copilot-ink-muted)]">
                              {formatMoneyPortfolio(row.total_debt)}
                              {row.overdue_debt > 0 ? (
                                <span className="mt-0.5 block text-xs text-rose-700">
                                  Vencido {formatMoneyPortfolio(row.overdue_debt)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskTone(row.risk)}`}
                              >
                                {row.risk}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 tabular-nums text-[var(--copilot-ink-muted)]">
                              {shareLabel(row.share_pct)}
                            </td>
                            <td className="px-4 py-2.5">
                              {row.has_contact_data ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                  Disponible
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50/70 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                  Sin contacto
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <CopilotGhostLink
                                  href={`/copilot/clientes/${encodeURIComponent(row.company_id)}`}
                                  className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold"
                                >
                                  Ver ficha 360
                                </CopilotGhostLink>
                                <CopilotGhostButton
                                  onClick={() => openClient(row.company_id)}
                                  className="whitespace-nowrap px-3 py-1.5 text-xs"
                                >
                                  Respaldo
                                </CopilotGhostButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CopilotCard>
          </>
        ) : null}
      </div>

      <CopilotClientEvidenceDrawer
        detail={activeDetail}
        isOpen={isEvidenceOpen && activeDetail != null}
        onClose={() => setIsEvidenceOpen(false)}
      />
    </div>
  );
}
