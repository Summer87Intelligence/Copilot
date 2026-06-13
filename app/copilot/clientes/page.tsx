"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle, Search } from "lucide-react";

import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotClientEvidenceDrawer } from "@/components/copilot/copilot-client-evidence-drawer";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotSectionTitle,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import { CopilotSkeletonTable } from "@/components/copilot/copilot-loading-skeleton";
import { DebtorsReportTrigger } from "@/components/copilot/reports/debtors-report-dialog";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import {
  type ClientCompanyDetail,
  type ClientPortfolioLoad,
} from "@/lib/copilot-clients-portfolio";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import {
  CLIENT_SALUD_LABEL,
  derivePortfolioSalud,
  type ClientSaludKey,
} from "@/lib/copilot-client-salud";

// ── Status derivation ────────────────────────────────────────────────────────

type ClientStatus = ClientSaludKey;

function deriveClientStatus(row: ClientPortfolioRow): ClientStatus {
  return derivePortfolioSalud(row);
}

const SALUD_LABEL = CLIENT_SALUD_LABEL;

function saludTone(s: ClientStatus): string {
  if (s === "critico") {
    return "text-[var(--copilot-danger-text-strong)] bg-[var(--copilot-badge-danger-bg)] border-[var(--copilot-danger-border)]";
  }
  if (s === "atrasado") {
    return "text-[var(--copilot-warning-text-strong)] bg-[var(--copilot-badge-warning-bg)] border-[var(--copilot-warning-border)]";
  }
  if (s === "pendiente") {
    return "text-[var(--copilot-ink)] bg-[var(--copilot-badge-neutral-bg)] border-[var(--copilot-border)]";
  }
  return "text-[var(--copilot-success-text-strong)] bg-[var(--copilot-badge-success-bg)] border-[var(--copilot-success-border)]";
}

// ── Filters ──────────────────────────────────────────────────────────────────

type ClientListFilter = "all" | "with_debt" | "vencido" | "critico" | "no_contact";
type ClientCurrencyFilter = "all" | "UYU" | "USD";

const FILTER_OPTIONS: Array<{ id: ClientListFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "with_debt", label: "Con deuda" },
  { id: "vencido", label: "Atrasados" },
  { id: "critico", label: "Críticos" },
  { id: "no_contact", label: "Sin contacto" },
];

const CURRENCY_FILTER_OPTIONS: Array<{ id: ClientCurrencyFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "UYU", label: "UYU" },
  { id: "USD", label: "USD" },
];

function matchesCurrencyFilter(row: ClientPortfolioRow, filter: ClientCurrencyFilter): boolean {
  if (filter === "UYU") return row.debt_uyu > 0;
  if (filter === "USD") return row.debt_usd > 0;
  return true;
}

function matchesClientFilter(
  row: ClientPortfolioRow,
  filter: ClientListFilter,
  search: string
): boolean {
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    const nameMatch = row.name.toLowerCase().includes(q);
    const transferMatch = (row.transfer_method ?? "").toLowerCase().includes(q);
    const aliasMatch = (row.transferAliases ?? []).some((a) => a.toLowerCase().includes(q));
    if (!nameMatch && !transferMatch && !aliasMatch) return false;
  }
  const status = deriveClientStatus(row);
  if (filter === "with_debt") return row.debt_uyu > 0 || row.debt_usd > 0;
  if (filter === "vencido") return status === "atrasado" || status === "critico";
  if (filter === "critico") return status === "critico";
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
    return <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap">
      {hasUyu ? (
        <span
          className={`inline-flex shrink-0 items-center tabular-nums text-sm font-semibold whitespace-nowrap text-[var(--copilot-danger-text-strong)] ${overdueUyu ? "" : ""}`}
        >
          $ {row.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-[10px] font-normal opacity-70">UYU</span>
          {overdueUyu ? (
            <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">
              atrasado
            </span>
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
          className={`inline-flex shrink-0 items-center tabular-nums text-sm font-semibold whitespace-nowrap text-[var(--copilot-danger-text-strong)]`}
        >
          U$S {row.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-[10px] font-normal opacity-70">USD</span>
          {overdueUsd ? (
            <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">
              atrasado
            </span>
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
      <span className="inline-flex items-center rounded-full border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--copilot-success-text-strong)]">
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
          className="flex items-center gap-1 rounded-lg border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-2 py-1 text-[10px] font-medium text-[var(--copilot-success-text-strong)] hover:bg-[var(--copilot-badge-success-bg)]"
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
          className="flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2 py-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
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
  const [currencyFilter, setCurrencyFilter] = useState<ClientCurrencyFilter>("all");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [data, aliasJson] = await Promise.all([
        fetchClientPortfolioLoad(),
        fetch("/api/copilot/transfer-aliases")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const byCompany: Record<string, string[]> = (aliasJson as { byCompany?: Record<string, string[]> } | null)?.byCompany ?? {};
      const rows = data.rows.map((r) => ({ ...r, transferAliases: byCompany[r.company_id] ?? [] }));
      const merged = { ...data, rows };
      setLoad(merged);
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.company_id === prev)) return prev;
        return rows[0]?.company_id ?? null;
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
    return load.rows.filter(
      (row) =>
        matchesClientFilter(row, clientFilter, search) &&
        matchesCurrencyFilter(row, currencyFilter)
    );
  }, [load, clientFilter, currencyFilter, search]);

  const statsLine = useMemo(() => {
    if (!load) return null;
    const overdueCount = load.rows.filter(
      (r) => (r.overdue_uyu ?? 0) > 0 || (r.overdue_usd ?? 0) > 0
    ).length;
    const withDebtCount = load.rows.filter((r) => r.debt_uyu > 0 || r.debt_usd > 0).length;
    const noContactCount = load.rows.filter((r) => !r.has_contact_data).length;
    return `${load.rows.length} activos · ${withDebtCount} con deuda · ${overdueCount} atrasados · ${noContactCount} sin contacto`;
  }, [load]);

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
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Clientes"
        description="Lista accionable de cartera: pendiente por moneda, salud y contacto."
      />
      {!loading && !error && statsLine ? (
        <p className="-mt-2 mb-1 text-sm text-[var(--copilot-ink-muted)]">{statsLine}</p>
      ) : null}

      <div className={copilotPageMainClass}>
        {loading ? <CopilotSkeletonTable rows={6} columns={5} /> : null}

        {error ? (
          <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-4 py-3 text-sm text-[var(--copilot-warning-text-strong)]">
            {error}
          </div>
        ) : null}

        {!loading && !error && load ? (
          <>
            {load.directory_diagnostics &&
            (load.directory_diagnostics.debtors_missing_company_row > 0 ||
              load.directory_diagnostics.debtors_inactive_company_row > 0) ? (
              <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-4 py-3 text-sm text-[var(--copilot-warning-text-strong)]">
                Se incorporaron{" "}
                {load.directory_diagnostics.debtors_missing_company_row +
                  load.directory_diagnostics.debtors_inactive_company_row}{" "}
                clientes detectados en facturas que no figuran como empresas activas en la cartera.
              </div>
            ) : null}

            <CopilotCard className="overflow-hidden p-0">
              <div className="border-b border-[var(--copilot-border)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CopilotSectionTitle
                    title="Cartera de clientes"
                    subtitle={`${visibleRows.length} de ${load.rows.length} clientes`}
                  />
                  <DebtorsReportTrigger
                    portfolioRows={load.rows}
                    portfolioDetails={load.details}
                    defaultFilters={{ status: "all", currency: "all" }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] shadow-sm hover:bg-[rgba(31,107,74,0.04)]"
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-1">
                    <Search className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar cliente…"
                      className="w-36 bg-transparent text-xs text-[var(--copilot-ink)] outline-none placeholder:text-[var(--copilot-ink-muted)]"
                    />
                  </div>
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
                            : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  <span className="hidden h-4 w-px bg-[var(--copilot-border)] sm:inline" aria-hidden />
                  {CURRENCY_FILTER_OPTIONS.map((opt) => {
                    const active = currencyFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCurrencyFilter(opt.id)}
                        className={[
                          "rounded-full px-3 py-1 text-xs font-medium transition",
                          active
                            ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                            : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
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
                  <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-4 py-2">Cliente</th>
                        <th className="px-4 py-2">Salud</th>
                        <th className="px-4 py-2">Total pendiente</th>
                        <th className="px-4 py-2">Contacto</th>
                        <th className="px-4 py-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const salud = deriveClientStatus(row);
                        const isSelected = row.company_id === selectedId;
                        const evidenceOpenForRow = isEvidenceOpen && isSelected;
                        return (
                          <tr
                            key={row.company_id}
                            className={`border-b border-[var(--copilot-border)] transition last:border-b-0 hover:bg-[var(--copilot-accent-soft)]/40 ${
                              evidenceOpenForRow ? "ring-1 ring-inset ring-[rgba(31,107,74,0.25)]" : ""
                            }`}
                          >
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
                                  <span className="inline-block rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-badge-neutral-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
                                    Vía facturación
                                  </span>
                                ) : null}
                              </div>
                              {row.industry && row.industry !== "—" ? (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--copilot-ink-muted)]">
                                  {row.industry}
                                </p>
                              ) : null}
                            </td>

                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${saludTone(salud)}`}
                              >
                                {SALUD_LABEL[salud]}
                              </span>
                            </td>

                            <td className="px-4 py-2.5">
                              <DebtCell row={row} />
                            </td>

                            <td className="px-4 py-2.5">
                              <ContactCell row={row} />
                            </td>

                            <td className="px-4 py-2.5 text-right">
                              <CopilotGhostButton
                                onClick={() => openClient(row.company_id)}
                                className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold"
                              >
                                Abrir
                              </CopilotGhostButton>
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
