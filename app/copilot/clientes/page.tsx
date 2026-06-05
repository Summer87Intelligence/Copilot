"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle, Search } from "lucide-react";

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
import { DebtorsReportTrigger } from "@/components/copilot/reports/debtors-report-dialog";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import {
  formatMoneyPortfolio,
  type ClientCompanyDetail,
  type ClientPortfolioLoad,
} from "@/lib/copilot-clients-portfolio";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

// ── Status derivation ────────────────────────────────────────────────────────

type ClientStatus = "al_dia" | "pendiente" | "vencido" | "critico";

function deriveClientStatus(row: ClientPortfolioRow): ClientStatus {
  const hasOverdue =
    (row.overdue_uyu ?? 0) > 0 || (row.overdue_usd ?? 0) > 0 || row.overdue_debt > 0;
  const hasDebt = row.debt_uyu > 0 || row.debt_usd > 0 || row.total_debt > 0;
  if (hasOverdue && row.risk === "Alto") return "critico";
  if (hasOverdue) return "vencido";
  if (hasDebt) return "pendiente";
  return "al_dia";
}

const STATUS_LABEL: Record<ClientStatus, string> = {
  al_dia: "Sin deuda",
  pendiente: "Deuda al día",
  vencido: "Vencido",
  critico: "Crítico",
};

function statusTone(s: ClientStatus): string {
  if (s === "critico") return "text-rose-800 bg-rose-100/80 border-rose-200/70";
  if (s === "vencido") return "text-orange-800 bg-orange-100/80 border-orange-200/70";
  if (s === "pendiente") return "text-amber-900 bg-amber-100/80 border-amber-200/70";
  return "text-emerald-900 bg-emerald-100/70 border-emerald-200/70";
}

function riskTone(r: ClientPortfolioRow["risk"]) {
  if (r === "Alto") return "text-rose-800 bg-rose-100/80";
  if (r === "Medio") return "text-amber-900 bg-amber-100/80";
  return "text-emerald-900 bg-emerald-100/70";
}

// ── Filters ──────────────────────────────────────────────────────────────────

type ClientListFilter = "all" | "with_debt" | "vencido" | "critico" | "al_dia" | "no_contact";

const FILTER_OPTIONS: Array<{ id: ClientListFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "with_debt", label: "Con deuda" },
  { id: "vencido", label: "Vencidos" },
  { id: "critico", label: "Críticos" },
  { id: "al_dia", label: "Sin deuda vencida" },
  { id: "no_contact", label: "Sin contacto" },
];

function matchesClientFilter(
  row: ClientPortfolioRow,
  filter: ClientListFilter,
  search: string
): boolean {
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    const nameMatch = row.name.toLowerCase().includes(q);
    const transferMatch = (row.transfer_method ?? "").toLowerCase().includes(q);
    if (!nameMatch && !transferMatch) return false;
  }
  const status = deriveClientStatus(row);
  if (filter === "with_debt") return row.debt_uyu > 0 || row.debt_usd > 0 || row.total_debt > 0;
  if (filter === "vencido") return status === "vencido" || status === "critico";
  if (filter === "critico") return status === "critico";
  if (filter === "al_dia") return status === "al_dia" || status === "pendiente";
  if (filter === "no_contact") return !row.has_contact_data;
  return true;
}

// ── Debt cell ────────────────────────────────────────────────────────────────

function DebtCell({ row }: { row: ClientPortfolioRow }) {
  const hasUyu = row.debt_uyu > 0;
  const hasUsd = row.debt_usd > 0;
  const overdueUyu = (row.overdue_uyu ?? 0) > 0;
  const overdueUsd = (row.overdue_usd ?? 0) > 0;

  if (!hasUyu && !hasUsd) {
    if (row.total_debt > 0) {
      return (
        <span className="tabular-nums text-sm text-[var(--copilot-ink-muted)]">
          {formatMoneyPortfolio(row.total_debt)}
        </span>
      );
    }
    return <span className="text-xs text-emerald-700">—</span>;
  }

  const uyuTitle = overdueUyu
    ? `$ ${row.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })} UYU vencido`
    : `$ ${row.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })} UYU`;
  const usdTitle = overdueUsd
    ? `U$S ${row.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })} USD vencido`
    : `U$S ${row.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })} USD`;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap"
      title={hasUyu && hasUsd ? `${uyuTitle} · ${usdTitle}` : hasUyu ? uyuTitle : usdTitle}
    >
      {hasUyu ? (
        <span
          className={`inline-flex shrink-0 items-center tabular-nums text-sm whitespace-nowrap ${overdueUyu ? "font-semibold text-rose-700" : "text-[var(--copilot-ink)]"}`}
        >
          $ {row.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-[10px] text-[var(--copilot-ink-muted)]">UYU</span>
          {overdueUyu ? (
            <span className="ml-1 text-[10px] font-medium text-rose-600">vencido</span>
          ) : null}
        </span>
      ) : null}
      {hasUyu && hasUsd ? (
        <span className="hidden text-[10px] text-[var(--copilot-ink-muted)] sm:inline" aria-hidden>
          ·
        </span>
      ) : null}
      {hasUsd ? (
        <span
          className={`inline-flex shrink-0 items-center tabular-nums text-sm whitespace-nowrap ${overdueUsd ? "font-semibold text-rose-700" : "text-amber-900"}`}
        >
          U$S {row.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-[10px] text-[var(--copilot-ink-muted)]">USD</span>
          {overdueUsd ? (
            <span className="ml-1 text-[10px] font-medium text-rose-600">vencido</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

// ── Contact cell ─────────────────────────────────────────────────────────────

function ContactCell({ row }: { row: ClientPortfolioRow }) {
  if (!row.has_contact_data) {
    return <span className="text-xs text-[var(--copilot-ink-muted)]">Sin contacto</span>;
  }
  const hasActions = row.contact_phone || row.contact_email;
  if (!hasActions) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
        Disponible
      </span>
    );
  }
  return (
    <div className="flex flex-nowrap items-center gap-1.5">
      {row.contact_phone ? (
        <a
          href={`https://wa.me/${row.contact_phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`WhatsApp ${row.contact_phone}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-2 py-1 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100/80"
        >
          <MessageCircle className="h-3 w-3" aria-hidden />
          WA
        </a>
      ) : null}
      {row.contact_email ? (
        <a
          href={`mailto:${row.contact_email}`}
          title={row.contact_email}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-2 py-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
        >
          <Mail className="h-3 w-3" aria-hidden />
          Email
        </a>
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CopilotClientesPage() {
  const { modulePermissions } = useCopilotPermissions();
  const [load, setLoad] = useState<ClientPortfolioLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<ClientListFilter>("all");
  const [search, setSearch] = useState("");

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
      setError(e instanceof Error ? e.message : "No se pudo cargar la cartera.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    return load.rows.filter((row) => matchesClientFilter(row, clientFilter, search));
  }, [load, clientFilter, search]);

  const hasActiveFilter = clientFilter !== "all" || search.trim() !== "";

  const activeDetail: ClientCompanyDetail | null = useMemo(() => {
    if (!load || !selectedId) return null;
    return load.details[selectedId] ?? null;
  }, [load, selectedId]);

  const openClient = (companyId: string) => {
    setSelectedId(companyId);
    setIsEvidenceOpen(true);
  };

  if (modulePermissions["clientes"] === "none") return <AccessDeniedCard />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <CopilotPageHeader
          surfaceId="copilot.clientes"
          title="Clientes"
          description="Cartera comercial activa: deuda por moneda, estado de cobranza y contacto directo."
        />
        {!loading && !error && load && hasActiveFilter ? (
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--copilot-border)] bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
            Resumen global · filtro activo
          </span>
        ) : null}
      </div>

      <div className={copilotPageMainClass}>
        {loading ? <CopilotSkeletonTable rows={6} columns={5} /> : null}

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            {error}
          </div>
        ) : null}

        {!loading && !error && load ? (
          <>
            {/* Summary cards — always global, independent of active filter */}
            {(() => {
              const overdueCount = load.rows.filter(
                (r) => (r.overdue_uyu ?? 0) > 0 || (r.overdue_usd ?? 0) > 0 || r.overdue_debt > 0
              ).length;
              const criticalCount = load.rows.filter(
                (r) => deriveClientStatus(r) === "critico"
              ).length;
              const withDebtCount = load.rows.filter(
                (r) => r.debt_uyu > 0 || r.debt_usd > 0 || r.total_debt > 0
              ).length;
              const noContactCount = load.rows.filter((r) => !r.has_contact_data).length;
              return (
                <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <CopilotCard className="py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Clientes activos
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--copilot-ink)]">
                      {load.rows.length}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
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
                  <CopilotCard
                    className={`py-3 ${criticalCount > 0 ? "border-rose-200/80 bg-rose-50/40" : overdueCount > 0 ? "border-orange-200/80 bg-orange-50/30" : ""}`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Vencidos
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold tabular-nums ${criticalCount > 0 ? "text-rose-700" : overdueCount > 0 ? "text-orange-700" : "text-[var(--copilot-ink)]"}`}
                    >
                      {overdueCount}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                      {criticalCount > 0
                        ? `${criticalCount} en nivel crítico`
                        : overdueCount === 0
                          ? "Sin deuda vencida"
                          : load.summary.concentration_line}
                    </p>
                  </CopilotCard>
                  <CopilotCard
                    className={`py-3 ${noContactCount > 0 ? "border-amber-200/80 bg-amber-50/40" : ""}`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Sin contacto
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold tabular-nums ${noContactCount > 0 ? "text-amber-700" : "text-[var(--copilot-ink)]"}`}
                    >
                      {noContactCount}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                      {noContactCount === 0
                        ? "Todos tienen datos de contacto"
                        : "Sin teléfono ni email registrado"}
                    </p>
                  </CopilotCard>
                </div>
                </>
              );
            })()}

            {load.directory_diagnostics &&
            (load.directory_diagnostics.debtors_missing_company_row > 0 ||
              load.directory_diagnostics.debtors_inactive_company_row > 0) ? (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
                Se incorporaron{" "}
                {load.directory_diagnostics.debtors_missing_company_row +
                  load.directory_diagnostics.debtors_inactive_company_row}{" "}
                clientes detectados en facturas que no figuran como empresas activas en la cartera.
              </div>
            ) : null}

            <CopilotCard className="overflow-hidden p-0">
              <div className="border-b border-[var(--copilot-border)] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CopilotSectionTitle
                    title="Cartera de clientes"
                    subtitle="Clientes, deuda y seguimiento de cobranza."
                  />
                  <DebtorsReportTrigger
                    portfolioRows={load.rows}
                    portfolioDetails={load.details}
                    defaultFilters={{ status: "all", currency: "all" }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] shadow-sm hover:bg-[rgba(31,107,74,0.04)]"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* Search */}
                  <div className="flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-white/80 px-3 py-1">
                    <Search className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar cliente…"
                      className="w-36 bg-transparent text-xs text-[var(--copilot-ink)] outline-none placeholder:text-[var(--copilot-ink-muted)]"
                    />
                  </div>
                  {/* Filters */}
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
                    {visibleRows.length} de {load.rows.length}
                  </span>
                </div>
              </div>

              {load.rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
                  No hay clientes en la cartera aún.
                </p>
              ) : visibleRows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
                  No hay clientes para este filtro.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-4 py-2">Cliente</th>
                        <th className="px-4 py-2">Estado</th>
                        <th className="px-4 py-2">Deuda total</th>
                        <th className="px-4 py-2">Riesgo</th>
                        <th className="px-4 py-2">Contacto</th>
                        <th className="px-4 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, i) => {
                        const status = deriveClientStatus(row);
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
                            {/* Cliente */}
                            <td className="max-w-[220px] px-4 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <CopilotInteractiveText
                                  icon="chevron"
                                  className="font-semibold"
                                  onClick={() => openClient(row.company_id)}
                                >
                                  {row.name}
                                </CopilotInteractiveText>
                                {row.derived_from_debt ? (
                                  <span className="inline-block rounded-full border border-slate-200/70 bg-slate-50/80 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                    Vía facturación
                                  </span>
                                ) : null}
                              </div>
                              {row.industry && row.industry !== "—" ? (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--copilot-ink-muted)]">
                                  {row.industry}
                                </p>
                              ) : null}
                              {row.transfer_method ? (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--copilot-ink-muted)]">
                                  {row.transfer_method}
                                </p>
                              ) : null}
                            </td>

                            {/* Estado */}
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusTone(status)}`}
                              >
                                {STATUS_LABEL[status]}
                              </span>
                            </td>

                            {/* Deuda */}
                            <td className="px-4 py-2.5">
                              <DebtCell row={row} />
                            </td>

                            {/* Riesgo */}
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskTone(row.risk)}`}
                              >
                                {row.risk}
                              </span>
                            </td>

                            {/* Contacto */}
                            <td className="px-4 py-2.5">
                              <ContactCell row={row} />
                            </td>

                            {/* Acciones */}
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <CopilotGhostLink
                                  href={`/copilot/clientes/${encodeURIComponent(row.company_id)}`}
                                  className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold"
                                >
                                  Ver ficha
                                </CopilotGhostLink>
                                <CopilotGhostButton
                                  onClick={() => openClient(row.company_id)}
                                  className="whitespace-nowrap px-3 py-1.5 text-xs"
                                >
                                  Resumen
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
