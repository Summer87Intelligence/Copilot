"use client";

import { Mail, MessageCircle, Search } from "lucide-react";

import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { DebtorsReportTrigger } from "@/components/copilot/reports/debtors-report-dialog";
import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import {
  CLIENT_DEBT_STATUS_LABEL,
  derivePortfolioDebtStatus,
  type ClientDebtStatus,
} from "@/lib/copilot-client-debt-status";
import type {
  ClientPortfolioLoad,
  ClientPortfolioRow,
} from "@/lib/copilot-clients-portfolio";

// ─── Filter contract (re-exported so page.tsx can keep state) ────────────────

export type ClientListFilter = "all" | "with_debt" | "delayed" | "critical" | "no_contact";
export type ClientCurrencyFilter = "all" | "UYU" | "USD";

const FILTER_OPTIONS: Array<{ id: ClientListFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "with_debt", label: "Con deuda" },
  { id: "delayed", label: "Atrasados" },
  { id: "critical", label: "Críticos" },
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
  const status = deriveClientStatus(row);
  if (filter === "with_debt") return row.debt_uyu > 0 || row.debt_usd > 0;
  if (filter === "delayed") return status === "delayed" || status === "critical";
  if (filter === "critical") return status === "critical";
  if (filter === "no_contact") return !row.has_contact_data;
  return true;
}

// ─── Status derivation ───────────────────────────────────────────────────────

type ClientStatus = ClientDebtStatus;

function deriveClientStatus(row: ClientPortfolioRow): ClientStatus {
  return derivePortfolioDebtStatus(row).status;
}

const SALUD_LABEL = CLIENT_DEBT_STATUS_LABEL;

function saludTone(s: ClientStatus): string {
  if (s === "critical") {
    return "text-[var(--copilot-danger-text-strong)] bg-[var(--copilot-badge-danger-bg)] border-[var(--copilot-danger-border)]";
  }
  if (s === "delayed") {
    return "text-[var(--copilot-warning-text-strong)] bg-[var(--copilot-badge-warning-bg)] border-[var(--copilot-warning-border)]";
  }
  if (s === "with_debt") {
    return "text-[var(--copilot-ink)] bg-[var(--copilot-badge-neutral-bg)] border-[var(--copilot-border)]";
  }
  return "text-[var(--copilot-success-text-strong)] bg-[var(--copilot-badge-success-bg)] border-[var(--copilot-success-border)]";
}

// ─── Debt cell ───────────────────────────────────────────────────────────────

function DebtCell({ row }: { row: ClientPortfolioRow }) {
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
  const hasUyu = row.debt_uyu > 0;
  const hasUsd = row.debt_usd > 0;
  const overdueUyu = (row.overdue_uyu ?? 0) > 0;
  const overdueUsd = (row.overdue_usd ?? 0) > 0;

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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap">
      {hasUyu ? (
        <span className="inline-flex shrink-0 items-center whitespace-nowrap tabular-nums text-sm font-semibold text-[var(--copilot-danger-text-strong)]">
          $ {row.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-[10px] font-normal opacity-70">UYU</span>
          {overdueUyu ? (
            <span className="ml-1 text-[10px] font-medium text-[var(--copilot-danger-text)]">atrasado</span>
          ) : null}
        </span>
      ) : null}
      {hasUyu && hasUsd ? (
        <span className="hidden text-[10px] text-[var(--copilot-ink-muted)] sm:inline" aria-hidden>
          ·
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

function PortfolioMobileCard({
  row,
  onOpenClient,
}: {
  row: ClientPortfolioRow;
  onOpenClient: (companyId: string) => void;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
  const salud = deriveClientStatus(row);
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
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${saludTone(salud)}`}
        >
          {SALUD_LABEL[salud]}
        </span>
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--copilot-border)] pt-3">
        <ContactCell row={row} />
        <CopilotGhostButton
          onClick={(e) => {
            e.stopPropagation();
            onOpenClient(row.company_id);
          }}
          className="px-3 py-1.5 text-xs font-semibold"
        >
          Ver ficha
        </CopilotGhostButton>
      </div>
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
  selectedId: string | null;
  isEvidenceOpen: boolean;
  onOpenClient: (companyId: string) => void;
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
  selectedId,
  isEvidenceOpen,
  onOpenClient,
}: ClientesPortfolioTableProps) {
  const columns: CopilotResponsiveTableColumn<ClientPortfolioRow>[] = [
    {
      key: "client",
      header: "Cliente",
      cellClassName: "max-w-[220px]",
      render: (row) => (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <CopilotInteractiveText
              icon="chevron"
              className="font-semibold"
              onClick={() => onOpenClient(row.company_id)}
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
            <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--copilot-ink-muted)]">{row.industry}</p>
          ) : null}
        </>
      ),
    },
    {
      key: "salud",
      header: "Riesgo",
      render: (row) => {
        const salud = deriveClientStatus(row);
        return (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${saludTone(salud)}`}
          >
            {SALUD_LABEL[salud]}
          </span>
        );
      },
    },
    {
      key: "debt",
      header: "Deuda actual",
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
        <CopilotGhostButton
          onClick={() => onOpenClient(row.company_id)}
          className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold"
        >
          Abrir
        </CopilotGhostButton>
      ),
    },
  ];

  const rowClassName = (row: ClientPortfolioRow) =>
    isEvidenceOpen && row.company_id === selectedId
      ? "ring-1 ring-inset ring-[var(--copilot-accent)]/30"
      : "";

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
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Search field */}
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full bg-transparent text-xs text-[var(--copilot-ink)] outline-none placeholder:text-[var(--copilot-ink-muted)] sm:w-36"
            />
          </div>
          {/* Filter + currency tabs — single scrollable row on mobile */}
          <div className="-mx-4 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="flex shrink-0 items-center gap-2">
              {FILTER_OPTIONS.map((opt) => {
                const active = clientFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onClientFilterChange(opt.id)}
                    className={[
                      "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition",
                      active
                        ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[var(--copilot-accent)]/30"
                        : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <span className="h-4 w-px shrink-0 bg-[var(--copilot-border)]" aria-hidden />
              {CURRENCY_FILTER_OPTIONS.map((opt) => {
                const active = currencyFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onCurrencyFilterChange(opt.id)}
                    className={[
                      "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition",
                      active
                        ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[var(--copilot-accent)]/30"
                        : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {load.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
          No hay clientes en la cartera aún.
        </p>
      ) : (
        <div className="px-3 py-3 sm:px-0 sm:py-0">
          <CopilotResponsiveTable<ClientPortfolioRow>
            rows={visibleRows}
            columns={columns}
            getRowKey={(row) => row.company_id}
            minWidth="680px"
            ariaLabel="Cartera de clientes"
            rowClassName={rowClassName}
            emptyState="No hay clientes para este filtro."
            mobileCard={(row) => <PortfolioMobileCard row={row} onOpenClient={onOpenClient} />}
          />
        </div>
      )}
    </CopilotCard>
  );
}
