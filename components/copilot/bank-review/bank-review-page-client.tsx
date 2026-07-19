"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import {
  FilterBar,
  FilterField,
  FilterSearchInput,
  FilterSelect,
} from "@/components/copilot/ui/filter-bar";
import { paginate } from "@/lib/ui/table-pagination-model";
import type { FilterValues } from "@/lib/ui/filter-bar-model";
import { BankReviewDrawer } from "@/components/copilot/bank-review/bank-review-drawer";
import {
  ActionChip,
  ConfidenceChip,
  HistoricalBadges,
  ReasonPills,
  ReviewStateBadge,
} from "@/components/copilot/bank-review/bank-review-badges";
import {
  applyBankReviewFilters,
  BANK_REVIEW_FILTER_DEFAULTS,
  findBankReviewRow,
  scopeForTab,
  type BankReviewFilters,
  type BankReviewRow,
  type BankReviewTab,
} from "@/lib/bank/review/bank-review-view";

type Summary = { operational: number; historical_review: number; matched_audit: number; pending: number };

const TABS: Array<{ key: BankReviewTab; label: string }> = [
  { key: "operational", label: "Operational" },
  { key: "historical", label: "Historical Review" },
  { key: "matched", label: "Matched Audit" },
];

const PAGE_SIZE = 20;

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MetricCard({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${muted ? "text-[var(--copilot-ink-muted)]" : "text-[var(--copilot-ink)]"}`}>
        {value}
      </p>
    </div>
  );
}

export function BankReviewPageClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<BankReviewTab>("operational");
  const [rowsByScope, setRowsByScope] = useState<Record<string, BankReviewRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BankReviewFilters>({ ...BANK_REVIEW_FILTER_DEFAULTS });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    try {
      const j = await (await fetch("/api/copilot/bank-review/summary")).json();
      if (j?.ok) setSummary(j.data as Summary);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  const loadScope = useCallback(async (t: BankReviewTab) => {
    if (t === "matched") return; // reservado — no consulta
    const scope = scopeForTab(t);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/bank-review?scope=${encodeURIComponent(scope)}`);
      const j = await res.json();
      if (j?.ok) {
        setRowsByScope((prev) => ({ ...prev, [scope]: j.data as BankReviewRow[] }));
      } else {
        setError(j?.message ?? "No se pudieron cargar las sugerencias.");
      }
    } catch {
      setError("No se pudieron cargar las sugerencias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "matched") return;
    const scope = scopeForTab(tab);
    if (!rowsByScope[scope]) void loadScope(tab);
  }, [tab, rowsByScope, loadScope]);

  function changeTab(next: BankReviewTab) {
    setTab(next);
    setFilters({ ...BANK_REVIEW_FILTER_DEFAULTS });
    setPage(1);
    setSelectedId(null);
  }

  function updateFilter(patch: Partial<BankReviewFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  const scope = scopeForTab(tab);
  const allRows = useMemo(() => rowsByScope[scope] ?? [], [rowsByScope, scope]);
  const filtered = useMemo(() => applyBankReviewFilters(allRows, filters), [allRows, filters]);
  const pageResult = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);
  const selectedRow = useMemo(() => findBankReviewRow(allRows, selectedId), [allRows, selectedId]);

  const isHistorical = tab === "historical";

  const columns: CopilotResponsiveTableColumn<BankReviewRow>[] = useMemo(() => {
    const base: CopilotResponsiveTableColumn<BankReviewRow>[] = [
      {
        key: "movimiento",
        header: "Movimiento",
        render: (r) => (
          <div className="flex flex-col">
            <span className="font-mono text-xs text-[var(--copilot-ink)]">{r.movementIdShort}…</span>
            <span className="text-[11px] text-[var(--copilot-ink-muted)]">{r.movement.descriptionMasked}</span>
          </div>
        ),
      },
      { key: "fecha", header: "Fecha", render: (r) => <span className="tabular-nums">{r.movement.date}</span> },
      { key: "moneda", header: "Moneda", render: (r) => r.movement.currency },
      {
        key: "importe",
        header: "Importe",
        cellClassName: "text-right tabular-nums",
        className: "text-right",
        render: (r) => fmtAmount(r.movement.amount, r.movement.currency),
      },
      { key: "cliente", header: "Cliente propuesto", render: (r) => r.clientName ?? (r.clientIdShort ? `${r.clientIdShort}…` : "—") },
      { key: "recibo", header: "Recibo", render: (r) => (r.receiptIdShort ? `${r.receiptIdShort}…` : "—") },
      { key: "confidence", header: "Confidence", render: (r) => <ConfidenceChip value={r.confidence} /> },
    ];

    if (isHistorical) {
      base.push(
        {
          key: "receipt_date",
          header: "Fecha recibo",
          render: (r) => <span className="tabular-nums">{r.receipt?.date ?? "—"}</span>,
        },
        {
          key: "diff",
          header: "Δ días",
          render: (r) => (
            <span className="tabular-nums">
              {r.evidence.dateProximityDays == null ? "—" : r.evidence.dateProximityDays}
            </span>
          ),
        },
        {
          key: "receipt_short",
          header: "Recibo ID",
          render: (r) => <span className="font-mono text-xs">{r.receiptIdShort ? `${r.receiptIdShort}…` : "—"}</span>,
        },
        {
          key: "client_short",
          header: "Cliente ID",
          render: (r) => <span className="font-mono text-xs">{r.clientIdShort ? `${r.clientIdShort}…` : "—"}</span>,
        },
      );
    }

    base.push(
      { key: "reasons", header: "Reasons", render: (r) => <ReasonPills reasons={r.reasons} /> },
      { key: "warnings", header: "Warnings", render: (r) => <ReasonPills reasons={r.warnings} /> },
      { key: "review_state", header: "Revisión", render: (r) => <ReviewStateBadge state={r.reviewState} /> },
    );

    if (isHistorical) {
      base.push({ key: "flags", header: "Ámbito", render: () => <HistoricalBadges /> });
    } else {
      base.push({ key: "status", header: "Acción", render: (r) => <ActionChip action={r.recommendedAction} /> });
    }

    base.push({
      key: "acciones",
      header: "Acciones",
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(r.id);
          }}
          className="inline-flex h-7 items-center rounded-lg border border-[var(--copilot-border)] px-2 text-[11px] font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-hover-bg)]"
        >
          Revisar
        </button>
      ),
    });

    return base;
  }, [isHistorical]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-[var(--copilot-ink)]">Revisión bancaria</h1>
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          Revisión manual de sugerencias generadas por el motor. Operativo e histórico separados; el histórico es
          audit-only y nunca ejecuta conciliación automática.
        </p>
      </header>

      {/* Métricas (calculadas server-side) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen">
        <MetricCard label="Operational" value={summary?.operational ?? 0} />
        <MetricCard label="Historical Review" value={summary?.historical_review ?? 0} />
        <MetricCard label="Matched Audit" value={summary?.matched_audit ?? 0} muted />
        <MetricCard label="Pendientes" value={summary?.pending ?? 0} />
      </section>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-1 border-b border-[var(--copilot-border)]" aria-label="Ámbitos">
        {TABS.map((t) => {
          const active = t.key === tab;
          const count =
            t.key === "operational"
              ? summary?.operational
              : t.key === "historical"
                ? summary?.historical_review
                : summary?.matched_audit;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[var(--copilot-accent)] text-[var(--copilot-ink)]"
                  : "border-transparent text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
              }`}
            >
              {t.label}
              <span className="rounded-full bg-[var(--copilot-soft-bg)] px-1.5 text-[11px] tabular-nums text-[var(--copilot-ink-muted)]">
                {count ?? 0}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Contenido por tab */}
      {tab === "matched" ? (
        <div className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-6 py-16 text-center">
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">Matched Audit</p>
          <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">Próximamente — reservado para una fase futura.</p>
        </div>
      ) : (
        <>
          {/* Filtros + buscador */}
          <FilterBar
            values={filters as unknown as FilterValues}
            defaults={BANK_REVIEW_FILTER_DEFAULTS as unknown as FilterValues}
            onClear={() => updateFilter(BANK_REVIEW_FILTER_DEFAULTS)}
          >
            <FilterField label="Buscar" htmlFor="br-q" className="min-w-[220px] flex-1">
              <FilterSearchInput
                id="br-q"
                value={filters.q ?? ""}
                onChange={(v) => updateFilter({ q: v })}
                placeholder="Movimiento, recibo, cliente, importe, fingerprint…"
              />
            </FilterField>
            <FilterField label="Revisión" htmlFor="br-review">
              <FilterSelect
                id="br-review"
                value={filters.review ?? "all"}
                onChange={(v) => updateFilter({ review: v })}
                options={[
                  { value: "all", label: "Todas" },
                  { value: "pending", label: "Pendiente" },
                  { value: "reviewed", label: "Revisada" },
                  { value: "rejected", label: "Rechazada" },
                ]}
              />
            </FilterField>
            <FilterField label="Estado" htmlFor="br-status">
              <FilterSelect
                id="br-status"
                value={filters.status ?? "all"}
                onChange={(v) => updateFilter({ status: v })}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "generated", label: "Generated" },
                  { value: "pending_review", label: "Pending review" },
                  { value: "superseded", label: "Superseded" },
                  { value: "rejected", label: "Rejected" },
                ]}
              />
            </FilterField>
            <FilterField label="Moneda" htmlFor="br-cur">
              <FilterSelect
                id="br-cur"
                value={filters.currency ?? "all"}
                onChange={(v) => updateFilter({ currency: v })}
                options={[
                  { value: "all", label: "Todas" },
                  { value: "UYU", label: "UYU" },
                  { value: "USD", label: "USD" },
                ]}
              />
            </FilterField>
            <FilterField label="Confidence" htmlFor="br-conf">
              <FilterSelect
                id="br-conf"
                value={filters.confidence ?? "all"}
                onChange={(v) => updateFilter({ confidence: v })}
                options={[
                  { value: "all", label: "Toda" },
                  { value: "high", label: "Alta (≥50)" },
                  { value: "mid", label: "Media (25–49)" },
                  { value: "low", label: "Baja (<25)" },
                ]}
              />
            </FilterField>
            <FilterField label="Evidencia" htmlFor="br-ev">
              <FilterSelect
                id="br-ev"
                value={filters.evidence ?? "all"}
                onChange={(v) => updateFilter({ evidence: v })}
                options={[
                  { value: "all", label: "Toda" },
                  { value: "has_receipt", label: "Con recibo" },
                  { value: "no_receipt", label: "Sin recibo" },
                  { value: "tie", label: "Empate" },
                  { value: "sin_evidencia", label: "Sin evidencia" },
                ]}
              />
            </FilterField>
            <FilterField label="Cliente" htmlFor="br-client">
              <FilterSearchInput
                id="br-client"
                value={filters.client ?? ""}
                onChange={(v) => updateFilter({ client: v })}
                placeholder="Nombre de cliente"
              />
            </FilterField>
          </FilterBar>

          {error ? (
            <p className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
              {error}
            </p>
          ) : null}

          <CopilotResponsiveTable
            rows={pageResult.pageRows}
            columns={columns}
            getRowKey={(r) => r.id}
            minWidth="1040px"
            ariaLabel={`Sugerencias ${scope}`}
            onRowClick={(r) => setSelectedId(r.id)}
            stickyHeader
            emptyState={loading ? "Cargando sugerencias…" : "Sin sugerencias para los filtros actuales."}
          />

          <TablePagination
            page={pageResult.safePage}
            totalPages={pageResult.totalPages}
            from={pageResult.from}
            to={pageResult.to}
            total={pageResult.total}
            itemLabel="sugerencias"
            onPageChange={setPage}
          />
        </>
      )}

      <BankReviewDrawer
        row={selectedRow}
        onClose={() => setSelectedId(null)}
        onActionComplete={async () => {
          await loadScope(tab);
          await refreshSummary();
        }}
      />
    </div>
  );
}
