"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CopilotClientEvidenceDrawer } from "@/components/copilot/copilot-client-evidence-drawer";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotPageMainClass } from "@/components/copilot/copilot-ui";
import { CopilotSkeletonTable } from "@/components/copilot/copilot-loading-skeleton";
import {
  ClientesPortfolioTable,
  matchesClientFilter,
  matchesCurrencyFilter,
  type ClientCurrencyFilter,
  type ClientListFilter,
} from "@/components/copilot/clientes/clientes-portfolio-table";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import {
  type ClientCompanyDetail,
  type ClientPortfolioLoad,
} from "@/lib/copilot-clients-portfolio";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

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

            <ClientesPortfolioTable
              load={load}
              visibleRows={visibleRows}
              search={search}
              onSearchChange={setSearch}
              clientFilter={clientFilter}
              onClientFilterChange={setClientFilter}
              currencyFilter={currencyFilter}
              onCurrencyFilterChange={setCurrencyFilter}
              selectedId={selectedId}
              isEvidenceOpen={isEvidenceOpen}
              onOpenClient={openClient}
            />
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
