"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Mail, MessageCircle } from "lucide-react";

import {
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CopilotButtonLink } from "@/components/copilot/ui/copilot-button";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { clientFichaHref } from "@/lib/copilot/client-360-href";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { DebtorsReportTrigger } from "@/components/copilot/reports/debtors-report-dialog";
import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import {
  FilterBar,
  FilterField,
  FilterSelect,
  FilterSearchInput,
} from "@/components/copilot/ui/filter-bar";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import { paginate, pageAfterFilterChange } from "@/lib/ui/table-pagination-model";
import {
  nextSortState,
  sortRows,
  type SortAccessor,
  type SortState,
} from "@/lib/ui/table-sort-model";
import { portfolioRowCollectionBucket } from "@/lib/copilot-cobranza-summary";
import {
  COLLECTION_AGING_BUCKETS,
  type CollectionAgingBucket,
  type CollectionAgingTone,
} from "@/lib/collection-aging/collection-aging-model";
import type {
  ClientPortfolioLoad,
  ClientPortfolioRow,
} from "@/lib/copilot-clients-portfolio";

const CLIENTES_PAGE_SIZE = 25;

/** Severidad de cobranza para ordenar "Salud" (al día → más atrasado). */
const AGING_SEVERITY: Record<CollectionAgingBucket, number> = {
  not_overdue: 0,
  overdue_8_14: 1,
  overdue_15_30: 2,
  overdue_30_plus: 3,
};

function clientAgingSeverity(row: ClientPortfolioRow): number {
  if (row.debt_uyu <= 0 && row.debt_usd <= 0) return -1; // al día
  return AGING_SEVERITY[portfolioRowCollectionBucket(row)] ?? 0;
}

const CLIENTES_SORT_ACCESSORS: Record<string, SortAccessor<ClientPortfolioRow>> = {
  name: (r) => r.name,
  salud: (r) => clientAgingSeverity(r),
};

// ─── Filter contract (re-exported so page.tsx can keep state) ────────────────

export type ClientListFilter =
  | "all"
  | "not_overdue"
  | "overdue_8_14"
  | "overdue_15_30"
  | "overdue_30_plus"
  | "no_contact";
export type ClientCurrencyFilter = "all" | "UYU" | "USD";

const FILTER_OPTIONS: Array<{ id: ClientListFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "not_overdue", label: "No atrasados" },
  { id: "overdue_8_14", label: "Atrasado 8–14" },
  { id: "overdue_15_30", label: "Atrasado 15–30" },
  { id: "overdue_30_plus", label: "Atrasado +30" },
  { id: "no_contact", label: "Sin contacto" },
];

const CURRENCY_FILTER_OPTIONS: Array<{ id: ClientCurrencyFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "UYU", label: "UYU" },
  { id: "USD", label: "USD" },
];

export function matchesCurrencyFilter(
  row: ClientPortfolioRow,
  filter: ClientCurrencyFilter
): boolean {
  if (filter === "UYU") return row.debt_uyu > 0;
  if (filter === "USD") return row.debt_usd > 0;
  return true;
}

export function matchesClientFilter(
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
  if (filter === "no_contact") return !row.has_contact_data;
  if (filter === "all") return true;
  // Resto de filtros = buckets del modelo único de cobranza por peor factura abierta.
  return portfolioRowCollectionBucket(row) === filter;
}

// ─── Aging classification (modelo único de cobranza por issue_date) ──────────

const hasOpenDebt = (row: ClientPortfolioRow): boolean =>
  row.debt_uyu > 0 || row.debt_usd > 0;

function agingTone(tone: CollectionAgingTone): string {
  if (tone === "danger") {
    return "text-[var(--copilot-danger-text-strong)] bg-[var(--copilot-badge-danger-bg)] border-[var(--copilot-danger-border)]";
  }
  if (tone === "warning") {
    return "text-[var(--copilot-warning-text-strong)] bg-[var(--copilot-badge-warning-bg)] border-[var(--copilot-warning-border)]";
  }
  if (tone === "success") {
    return "text-[var(--copilot-success-text-strong)] bg-[var(--copilot-badge-success-bg)] border-[var(--copilot-success-border)]";
  }
  return "text-[var(--copilot-ink)] bg-[var(--copilot-badge-neutral-bg)] border-[var(--copilot-border)]";
}

/**
 * Badge de salud de cobranza: clientes sin deuda abierta muestran "Al día";
 * el resto, el bucket de su peor factura abierta.
 */
function ClientAgingBadge({ row, className = "" }: { row: ClientPortfolioRow; className?: string }) {
  if (!hasOpenDebt(row)) {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-success-text-strong)] bg-[var(--copilot-badge-success-bg)] border-[var(--copilot-success-border)] ${className}`}
      >
        Al día
      </span>
    );
  }
  const bucket: CollectionAgingBucket = portfolioRowCollectionBucket(row);
  const spec = COLLECTION_AGING_BUCKETS[bucket];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${agingTone(spec.tone)} ${className}`}
    >
      {spec.shortLabel}
    </span>
  );
}

// ─── Debt cell ───────────────────────────────────────────────────────────────

function DebtCell({ row }: { row: ClientPortfolioRow }) {
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
  const hasUyu = row.debt_uyu > 0;
  const hasUsd = row.debt_usd > 0;
  const overdueUyu = (row.collection_overdue_uyu ?? 0) > 0;
  const overdueUsd = (row.collection_overdue_usd ?? 0) > 0;

  if (!hasUyu && !hasUsd) {
    return <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>;
  }

  if (isUsd) {
    const total = convertToUsdEquivalent({ uyu: row.debt_uyu, usd: row.debt_usd }, fxRate);
    return (
      <div className="space-y-0.5">
        <span className="inline-flex items-center whitespace-nowrap tabular-nums text-sm font-semibold text-[var(--copilot-danger-text-strong)]">
          {formatUsdEquivalent(total)}
          {(overdueUyu || overdueUsd) ? (
            <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">atrasado</span>
          ) : null}
        </span>
        <p className="text-[10px] text-[var(--copilot-ink-muted)]">TC {fxRate}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      {hasUyu ? (
        <span className="inline-flex shrink-0 items-center whitespace-nowrap tabular-nums text-sm font-semibold text-[var(--copilot-danger-text-strong)]">
          $ {row.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-[10px] font-normal opacity-70">UYU</span>
          {overdueUyu ? (
            <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">atrasado</span>
          ) : null}
        </span>
      ) : null}
      {hasUsd ? (
        <span className="inline-flex shrink-0 items-center whitespace-nowrap tabular-nums text-sm font-semibold text-[var(--copilot-danger-text-strong)]">
          U$S {row.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-[10px] font-normal opacity-70">USD</span>
          {overdueUsd ? (
            <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">atrasado</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

// ─── Contact cell ────────────────────────────────────────────────────────────

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

// ─── Mobile card ─────────────────────────────────────────────────────────────

function PortfolioMobileCard({ row }: { row: ClientPortfolioRow }) {
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
  const openInvoices = row.open_invoices_count ?? null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--copilot-ink)]">{row.name}</p>
          {row.industry && row.industry !== "—" ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--copilot-ink-muted)]">{row.industry}</p>
          ) : null}
        </div>
        <ClientAgingBadge row={row} className="shrink-0" />
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        {row.debt_uyu === 0 && row.debt_usd === 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Deuda</dt>
            <dd className="text-[var(--copilot-success-text-strong)]">Al día</dd>
          </div>
        ) : isUsd ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Deuda (USD est.)</dt>
            <dd className="tabular-nums font-semibold text-[var(--copilot-danger-text-strong)]">
              {formatUsdEquivalent(convertToUsdEquivalent({ uyu: row.debt_uyu, usd: row.debt_usd }, fxRate))}
              <span className="ml-1 text-[10px] font-normal opacity-70">TC {fxRate}</span>
            </dd>
          </div>
        ) : (
          <>
            {row.debt_uyu > 0 ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Deuda UYU</dt>
                <dd className="tabular-nums font-semibold text-[var(--copilot-danger-text-strong)]">
                  $ {row.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  {(row.overdue_uyu ?? 0) > 0 ? (
                    <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">atrasado</span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {row.debt_usd > 0 ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Deuda USD</dt>
                <dd className="tabular-nums font-semibold text-[var(--copilot-danger-text-strong)]">
                  U$S {row.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  {(row.overdue_usd ?? 0) > 0 ? (
                    <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">atrasado</span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </>
        )}
        {openInvoices != null && openInvoices > 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Facturas abiertas</dt>
            <dd className="tabular-nums text-[var(--copilot-ink)]">{openInvoices}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--copilot-border)] pt-3">
        <ContactCell row={row} />
      </div>
      <CopilotButtonLink
        href={clientFichaHref(row.company_id)}
        variant="ghost"
        size="sm"
        fullWidth
        className="mt-2 text-xs font-semibold"
      >
        Abrir ficha del cliente
      </CopilotButtonLink>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export type ClientesPortfolioTableProps = {
  load: ClientPortfolioLoad;
  visibleRows: ClientPortfolioRow[];
  search: string;
  onSearchChange: (v: string) => void;
  clientFilter: ClientListFilter;
  onClientFilterChange: (v: ClientListFilter) => void;
  currencyFilter: ClientCurrencyFilter;
  onCurrencyFilterChange: (v: ClientCurrencyFilter) => void;
};

export function ClientesPortfolioTable({
  load,
  visibleRows,
  search,
  onSearchChange,
  clientFilter,
  onClientFilterChange,
  currencyFilter,
  onCurrencyFilterChange,
}: ClientesPortfolioTableProps) {
  const [sort, setSort] = useState<SortState>({ key: null, direction: "asc" });
  const [page, setPage] = useState(1);

  // Reset de página cuando cambia el conjunto filtrado (evita quedar en una
  // página fuera de rango con el nuevo resultado).
  const filterSig = `${clientFilter}|${currencyFilter}|${search.trim().toLowerCase()}`;
  const [appliedSig, setAppliedSig] = useState(filterSig);
  if (appliedSig !== filterSig) {
    setAppliedSig(filterSig);
    setPage(pageAfterFilterChange());
  }

  const sortedRows = useMemo(() => {
    const accessor = sort.key ? CLIENTES_SORT_ACCESSORS[sort.key] ?? null : null;
    return sortRows(visibleRows, accessor, sort.direction);
  }, [visibleRows, sort]);

  const pageResult = useMemo(
    () => paginate(sortedRows, page, CLIENTES_PAGE_SIZE),
    [sortedRows, page]
  );

  const handleSort = (key: string) => setSort((prev) => nextSortState(prev, key));
  const handleClearFilters = () => {
    onSearchChange("");
    onClientFilterChange("all");
    onCurrencyFilterChange("all");
  };

  const columns: CopilotResponsiveTableColumn<ClientPortfolioRow>[] = [
    {
      key: "client",
      header: "Cliente",
      sortKey: "name",
      cellClassName: "max-w-[220px]",
      render: (row) => (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={clientFichaHref(row.company_id)}
              className="inline-flex max-w-full min-w-0 items-center gap-1.5 font-semibold text-[var(--copilot-accent)]/95 transition-colors duration-200 hover:text-[var(--copilot-accent)] hover:underline hover:decoration-dotted hover:underline-offset-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
            >
              <span className="min-w-0 truncate">{row.name}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            </Link>
            {row.derived_from_debt ? (
              <span className="inline-block rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-badge-neutral-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
                Vía facturación
              </span>
            ) : null}
          </div>
          {row.industry && row.industry !== "—" ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--copilot-ink-muted)]">{row.industry}</p>
          ) : null}
        </>
      ),
    },
    {
      key: "salud",
      header: "Salud",
      sortKey: "salud",
      render: (row) => <ClientAgingBadge row={row} />,
    },
    {
      key: "debt",
      header: "Total pendiente",
      render: (row) => <DebtCell row={row} />,
    },
    {
      key: "contact",
      header: "Contacto",
      render: (row) => <ContactCell row={row} />,
    },
    {
      key: "action",
      header: "Acción",
      className: "text-right",
      cellClassName: "text-right",
      render: (row) => (
        <CopilotGhostLink
          href={clientFichaHref(row.company_id)}
          className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold"
        >
          Abrir ficha del cliente
        </CopilotGhostLink>
      ),
    },
  ];

  return (
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
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] shadow-sm hover:bg-[var(--copilot-accent-soft)]"
          />
        </div>
        <FilterBar
          className="mt-2"
          values={{ status: clientFilter, currency: currencyFilter, search }}
          defaults={{ status: "all", currency: "all", search: "" }}
          onClear={handleClearFilters}
        >
          <FilterField label="Buscar" htmlFor="clientes-search" className="min-w-[180px] flex-1">
            <FilterSearchInput
              id="clientes-search"
              value={search}
              onChange={onSearchChange}
              placeholder="Buscar cliente…"
              ariaLabel="Buscar cliente"
            />
          </FilterField>
          <FilterField label="Estado" htmlFor="clientes-estado">
            <FilterSelect
              id="clientes-estado"
              value={clientFilter}
              onChange={(v) => onClientFilterChange(v as ClientListFilter)}
              options={FILTER_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
              ariaLabel="Filtrar por estado"
            />
          </FilterField>
          <FilterField label="Moneda" htmlFor="clientes-moneda">
            <FilterSelect
              id="clientes-moneda"
              value={currencyFilter}
              onChange={(v) => onCurrencyFilterChange(v as ClientCurrencyFilter)}
              options={CURRENCY_FILTER_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
              ariaLabel="Filtrar por moneda"
            />
          </FilterField>
        </FilterBar>
      </div>

      {load.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
          No hay clientes en la cartera aún.
        </p>
      ) : (
        <div className="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
          <CopilotResponsiveTable<ClientPortfolioRow>
            rows={pageResult.pageRows}
            columns={columns}
            getRowKey={(row) => row.company_id}
            minWidth="760px"
            ariaLabel="Cartera de clientes"
            emptyState="No hay clientes para este filtro."
            mobileCard={(row) => <PortfolioMobileCard row={row} />}
            sort={{ state: sort, onSort: handleSort }}
          />
          <TablePagination
            page={pageResult.safePage}
            totalPages={pageResult.totalPages}
            from={pageResult.from}
            to={pageResult.to}
            total={pageResult.total}
            itemLabel="clientes"
            onPageChange={setPage}
          />
        </div>
      )}
    </CopilotCard>
  );
}
