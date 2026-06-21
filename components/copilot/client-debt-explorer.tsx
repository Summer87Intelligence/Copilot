"use client";

/**
 * ClientDebtExplorer
 * ------------------
 * Tabla analítica de deuda real por cliente. Render-only:
 *  - Fuente: report.staleClients (pendingByCurrency, dominantAgingRange, status, etc.)
 *  - Sin recálculo de balances en frontend.
 *  - Memoización fuerte: filtro, sort y paginación solo se recomputan al cambiar inputs.
 *
 * Features: sticky header, search debounced, sorting, filter chips,
 *           expand row (resumen del cliente + acciones de cobranza), paginación 25/50/100.
 */

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Plus,
  Search,
  Users,
} from "lucide-react";

import { CollectionActionDrawer } from "@/components/copilot/collection-action-drawer";
import {
  COLLECTION_STATUS_LABELS,
  COLLECTION_ACTION_TYPE_LABELS,
  type CollectionAction,
  COLLECTION_API,
} from "@/lib/copilot-collection-types";

import {
  formatCarteraMoney,
  formatCarteraInteger,
  formatRelativeAgeHours,
} from "@/lib/copilot-cartera-format";
import type {
  AgingRange,
  ClientStaleness,
  FinancialConsistencyReport,
  PendingInvoiceLine,
  ReconciliationCurrencyCode,
  StalenessStatus,
} from "@/lib/copilot-financial-reconciliation";
import { clientMatchesDebtExplorerSearch } from "@/lib/copilot-debt-explorer-search";
import {
  daysOverdueFromDate,
  formatCopilotDate,
  formatOverdueDaysLabel,
} from "@/lib/copilot-format";
import type { CurrencyFilter } from "@/components/copilot/financial-control-bar";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type SortField =
  | "name"
  | "pendingUYU"
  | "pendingUSD"
  | "aging"
  | "risk"
  | "invoices"
  | "lastSync";
type SortDir = "asc" | "desc";
// CLIENT-DEBT-SEMANTICS-001 Etapa D: keys alineadas a la taxonomía.
// "no_issue_date" = cliente con deuda sin fecha de emisión derivable.
type FilterChip = "all" | "no_issue_date" | "delayed" | "critical" | "no_debt";
type PageSize = 25 | 50 | 100;
type RiskLevel = "high" | "medium" | "low" | "ok" | "none";
type CollectionActionsByCompany = Map<string, CollectionAction[]>;
type CollectionActionsCacheEntry = {
  actions: CollectionAction[];
  expiresAt: number;
};

// ---------------------------------------------------------------------------
// Config visual
// ---------------------------------------------------------------------------

const AGING_LABELS: Record<AgingRange, string> = {
  "0_30":    "0–30 días",
  "31_60":   "31–60 días",
  "61_90":   "61–90 días",
  "90_plus": "+90 días",
};

const AGING_BADGE: Record<AgingRange, string> = {
  "0_30":    "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  "31_60":   "border-[var(--copilot-warning-border)]   bg-[var(--copilot-tone-warning-bg)]   text-[var(--copilot-warning-text-strong)]",
  "61_90":   "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  "90_plus": "border-[var(--copilot-danger-border)]    bg-[var(--copilot-tone-danger-bg)]    text-[var(--copilot-danger-text-strong)]",
};

const RISK_BADGE: Record<RiskLevel, { cls: string; label: string }> = {
  high:   { cls: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",       label: "Crítico" },
  medium: { cls: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]", label: "Atención" },
  low:    { cls: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",     label: "Al día" },
  ok:     { cls: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]", label: "Al día" },
  none:   { cls: "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 text-[var(--copilot-ink-muted)]", label: "—" },
};

const STALE_BADGE: Record<StalenessStatus, { cls: string; label: string }> = {
  ok:           { cls: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",   label: "Al día" },
  warning:      { cls: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",         label: "Alerta" },
  critical:     { cls: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",             label: "Crítico" },
  never_synced: { cls: "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 text-[var(--copilot-ink-muted)]", label: "—" },
};

// ---------------------------------------------------------------------------
// Estado visible del cliente — semántica unificada CLIENT-DEBT-SEMANTICS-001:
//   Al día (sin deuda) / Con deuda (0–30) / Atrasado (31–90) / Crítico (91+).
// Las claves internas mantienen los nombres legacy para no romper consumers
// dentro del archivo; los labels se actualizan a la nueva taxonomía.
// ---------------------------------------------------------------------------

type ClientDisplayStatus =
  | "al_dia"
  | "con_deuda"
  | "atrasado"
  | "critico"
  | "datos"
  | "sin_datos";

const CLIENT_DISPLAY_STATUS_BADGE: Record<
  ClientDisplayStatus,
  { cls: string; label: string }
> = {
  al_dia:    { cls: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]", label: "Al día" },
  con_deuda: { cls: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink)]", label: "Con deuda" },
  atrasado:  { cls: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]", label: "Atrasado" },
  critico:   { cls: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]", label: "Crítico" },
  datos:     { cls: "border-[var(--copilot-border)] bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)]", label: "Datos por revisar" },
  sin_datos: { cls: "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 text-[var(--copilot-ink-muted)]", label: "Sin datos" },
};

export function deriveClientDisplayStatus(client: ClientStaleness): ClientDisplayStatus {
  const debtAmounts = Object.values(client.pendingByCurrency);
  const hasDebt = debtAmounts.some((v) => (v ?? 0) > 0);
  const aging = client.dominantAgingRange;
  const syncStale =
    client.status === "critical" || client.status === "never_synced";

  if (!hasDebt) {
    if (client.invoiceCount === 0) return "sin_datos";
    if (syncStale) return "datos";
    return "al_dia";
  }

  // dominantAgingRange ya usa días desde emisión (computeAgingRange en
  // copilot-financial-reconciliation.ts), así que mapeamos directo a la
  // nueva taxonomía.
  if (aging === "90_plus") return "critico";
  if (aging === "61_90" || aging === "31_60") return "atrasado";
  if (aging === "0_30") return "con_deuda";
  // hasDebt pero sin aging parseable → con deuda sin fecha de emisión.
  return "con_deuda";
}

const FILTER_CHIPS: Array<{ id: FilterChip; label: string }> = [
  { id: "all",            label: "Todos" },
  { id: "no_issue_date",  label: "Sin fecha" },
  { id: "delayed",        label: "Atrasados" },
  { id: "critical",       label: "Críticos" },
  { id: "no_debt",        label: "Sin deuda" },
];

const COLLECTION_ACTIONS_CACHE_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRiskLevel(client: ClientStaleness): RiskLevel {
  const hasDebt = Object.values(client.pendingByCurrency).some((v) => (v ?? 0) > 0);
  if (!hasDebt) return "none";
  const { dominantAgingRange: aging, status } = client;
  if (aging === "90_plus" || status === "critical" || status === "never_synced") return "high";
  if (aging === "61_90" || status === "warning") return "medium";
  if (aging === "31_60") return "low";
  return "ok";
}

const RISK_SORT_ORDER: Record<RiskLevel, number> = {
  high: 0, medium: 1, low: 2, ok: 3, none: 4,
};

const AGING_SORT_ORDER: Record<AgingRange, number> = {
  "90_plus": 0, "61_90": 1, "31_60": 2, "0_30": 3,
};

function matchesFilter(client: ClientStaleness, chip: FilterChip): boolean {
  const hasDebt = Object.values(client.pendingByCurrency).some((v) => (v ?? 0) > 0);
  if (chip === "all") return true;
  if (chip === "no_debt") return !hasDebt;
  if (chip === "no_issue_date") return hasDebt && client.dominantAgingRange === null;
  if (chip === "delayed") {
    return (
      hasDebt &&
      (client.dominantAgingRange === "31_60" || client.dominantAgingRange === "61_90")
    );
  }
  if (chip === "critical") {
    return (
      hasDebt &&
      (client.dominantAgingRange === "90_plus" ||
        client.status === "critical" ||
        client.status === "never_synced")
    );
  }
  return true;
}

function maxClientOverdueDays(client: ClientStaleness): number | null {
  let max: number | null = null;
  for (const line of client.pendingInvoices ?? []) {
    const days = daysOverdueFromDate(line.dueDate);
    if (days != null) max = max === null ? days : Math.max(max, days);
  }
  return max;
}

function sortClients(
  clients: ClientStaleness[],
  field: SortField,
  dir: SortDir
): ClientStaleness[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...clients].sort((a, b) => {
    let diff = 0;
    switch (field) {
      case "name":
        diff = (a.companyName ?? "").localeCompare(b.companyName ?? "", "es-UY");
        break;
      case "pendingUYU":
        diff = (a.pendingByCurrency.UYU ?? 0) - (b.pendingByCurrency.UYU ?? 0);
        break;
      case "pendingUSD":
        diff = (a.pendingByCurrency.USD ?? 0) - (b.pendingByCurrency.USD ?? 0);
        break;
      case "aging":
        diff =
          (a.dominantAgingRange !== null
            ? AGING_SORT_ORDER[a.dominantAgingRange]
            : 99) -
          (b.dominantAgingRange !== null
            ? AGING_SORT_ORDER[b.dominantAgingRange]
            : 99);
        break;
      case "risk":
        diff = RISK_SORT_ORDER[deriveRiskLevel(a)] - RISK_SORT_ORDER[deriveRiskLevel(b)];
        break;
      case "invoices":
        diff = a.invoiceCount - b.invoiceCount;
        break;
      case "lastSync":
        diff = (a.ageHours ?? Infinity) - (b.ageHours ?? Infinity);
        break;
    }
    return diff * sign;
  });
}

function collectionActionsCacheKey(
  companyId: string,
  periodStart: string | null,
  periodEnd: string | null
): string {
  return `${companyId}|${periodStart ?? ""}|${periodEnd ?? ""}`;
}

function isLikelyMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ClientDebtExplorer({
  report,
  selectedCurrency = "all",
  initialFilterChip = "all",
}: {
  report: FinancialConsistencyReport;
  selectedCurrency?: CurrencyFilter;
  initialFilterChip?: FilterChip;
}) {
  const [rawSearch, setRawSearch] = useState("");
  const search = useDeferredValue(rawSearch);
  const [filterChip, setFilterChip] = useState<FilterChip>(initialFilterChip);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "risk",
    dir: "asc",
  });
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [drawerCompany, setDrawerCompany] = useState<{ id: string; name: string } | null>(null);
  const [showWithoutDebt, setShowWithoutDebt] = useState(false);
  const [actionsByCompany, setActionsByCompany] = useState<CollectionActionsByCompany>(
    () => new Map()
  );
  const [loadingActionIds, setLoadingActionIds] = useState<Set<string>>(
    () => new Set()
  );
  const loadingActionIdsRef = useRef<Set<string>>(new Set());
  const actionsCacheRef = useRef<Map<string, CollectionActionsCacheEntry>>(new Map());
  const actionsAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const actionsStatsRef = useRef({ completed: 0, aborted: 0 });
  const reduce = useReducedMotion();

  const currencyFilter: ReconciliationCurrencyCode | null =
    selectedCurrency === "USD" || selectedCurrency === "UYU"
      ? selectedCurrency
      : null;

  // Sort efectivo: si la columna de saldo está oculta porque hay filtro de
  // moneda, derivamos un sort alternativo (no se persiste, sólo afecta la
  // vista actual). Cuando el filtro vuelve a "all", el sort original se
  // restaura automáticamente.
  const effectiveSort = useMemo<{ field: SortField; dir: SortDir }>(() => {
    if (currencyFilter) {
      const opposite: SortField =
        currencyFilter === "USD" ? "pendingUYU" : "pendingUSD";
      if (sort.field === opposite) {
        return { field: "risk", dir: "asc" };
      }
    }
    return sort;
  }, [sort, currencyFilter]);

  // Pre-filter: only clients with at least one positive pending balance (operational cartera).
  // Clients with all-zero balances are hidden by default to avoid ambiguous "—" rows.
  // Cuando hay filtro de moneda, se exige saldo > 0 EN ESA moneda específica.
  const baseClients = useMemo(() => {
    if (currencyFilter) {
      return report.staleClients.filter((c) => {
        const balance = c.pendingByCurrency[currencyFilter] ?? 0;
        if (showWithoutDebt) {
          // En moneda específica, "sin deuda" ya no aplica como concepto útil
          // (filtraríamos también a quienes tienen saldo en la otra moneda).
          // Mantenemos el flag para no romper el toggle, pero la moneda manda.
          return balance > 0;
        }
        return balance > 0;
      });
    }
    return showWithoutDebt
      ? report.staleClients
      : report.staleClients.filter((c) =>
          Object.values(c.pendingByCurrency).some((v) => (v ?? 0) > 0)
        );
  }, [report.staleClients, showWithoutDebt, currencyFilter]);

  const withoutDebtCount = useMemo(() => {
    if (currencyFilter) return 0;
    return report.staleClients.filter(
      (c) => !Object.values(c.pendingByCurrency).some((v) => (v ?? 0) > 0)
    ).length;
  }, [report.staleClients, currencyFilter]);

  const handleSort = useCallback((field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
    setPage(0);
  }, []);

  const handleFilterChip = useCallback((chip: FilterChip) => {
    setFilterChip(chip);
    setPage(0);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawSearch(e.target.value);
    setPage(0);
  }, []);

  const filtered = useMemo(() => {
    return baseClients.filter((c) => {
      const nameMatch = clientMatchesDebtExplorerSearch(c, search);
      const chipMatch = matchesFilter(c, filterChip);
      return nameMatch && chipMatch;
    });
  }, [baseClients, search, filterChip]);

  const sorted = useMemo(
    () => sortClients(filtered, effectiveSort.field, effectiveSort.dir),
    [filtered, effectiveSort]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageStart = clampedPage * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  const inputRef = useRef<HTMLInputElement>(null);

  const loadCollectionActions = useCallback(
    async (companyIds: readonly string[], reason: "expand" | "hover" | "drawer") => {
      const started = performance.now();
      const concurrentLimit = isLikelyMobile() ? 2 : 4;
      const uniqueIds = Array.from(
        new Set(companyIds.map((id) => id.trim()).filter(Boolean))
      );
      if (uniqueIds.length === 0) return;

      const now = Date.now();
      const cacheHits: Array<[string, CollectionAction[]]> = [];
      const misses: string[] = [];
      for (const id of uniqueIds) {
        const key = collectionActionsCacheKey(id, report.periodStart, report.periodEnd);
        const cached = actionsCacheRef.current.get(key);
        if (cached && cached.expiresAt > now) {
          cacheHits.push([id, cached.actions]);
        } else if (!loadingActionIdsRef.current.has(id)) {
          misses.push(id);
        }
      }

      if (cacheHits.length > 0) {
        setActionsByCompany((prev) => {
          const next = new Map(prev);
          for (const [id, actions] of cacheHits) next.set(id, actions);
          return next;
        });
      }
      if (misses.length === 0) return;

      if (actionsAbortControllersRef.current.size >= concurrentLimit) {
        console.info(
          JSON.stringify({
            source: "collection_actions",
            kind: "collection_actions_load",
            reason,
            total_companies: uniqueIds.length,
            fetched_companies: 0,
            cache_hits: cacheHits.length,
            concurrent_limit: concurrentLimit,
            requests_completed: actionsStatsRef.current.completed,
            requests_aborted: actionsStatsRef.current.aborted,
            skipped_due_to_limit: true,
            duration_ms: Math.round((performance.now() - started) * 100) / 100,
          })
        );
        return;
      }

      const controller = new AbortController();
      actionsAbortControllersRef.current.add(controller);

      setLoadingActionIds((prev) => {
        const next = new Set(prev);
        for (const id of misses) next.add(id);
        loadingActionIdsRef.current = next;
        return next;
      });

      try {
        const res = await fetch(COLLECTION_API.batch, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ company_ids: misses }),
        });
        const json = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              actionsByCompany?: Record<string, CollectionAction[]>;
            }
          | null;
        if (controller.signal.aborted) return;
        if (!res.ok || !json?.ok || !json.actionsByCompany) return;

        const expiresAt = Date.now() + COLLECTION_ACTIONS_CACHE_TTL_MS;
        setActionsByCompany((prev) => {
          const next = new Map(prev);
          for (const id of misses) {
            const actions = json.actionsByCompany?.[id] ?? [];
            next.set(id, actions);
            actionsCacheRef.current.set(
              collectionActionsCacheKey(id, report.periodStart, report.periodEnd),
              { actions, expiresAt }
            );
          }
          return next;
        });
        actionsStatsRef.current.completed += misses.length;
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          actionsStatsRef.current.aborted += misses.length;
          return;
        }
        // No bloquea cartera: collection-actions es metadata operativa.
        console.warn("[collection_actions_load_failed]", err);
      } finally {
        actionsAbortControllersRef.current.delete(controller);
        if (!controller.signal.aborted) {
          setLoadingActionIds((prev) => {
            const next = new Set(prev);
            for (const id of misses) next.delete(id);
            loadingActionIdsRef.current = next;
            return next;
          });
        }
        console.info(
          JSON.stringify({
            source: "collection_actions",
            kind: "collection_actions_load",
            reason,
            total_companies: uniqueIds.length,
            fetched_companies: misses.length,
            cache_hits: cacheHits.length,
            concurrent_limit: concurrentLimit,
            requests_completed: actionsStatsRef.current.completed,
            requests_aborted: actionsStatsRef.current.aborted,
            duration_ms: Math.round((performance.now() - started) * 100) / 100,
          })
        );
      }
    },
    [report.periodEnd, report.periodStart]
  );

  useEffect(() => {
    const ids = Array.from(expandedIds);
    if (ids.length > 0) void loadCollectionActions(ids, "expand");
  }, [expandedIds, loadCollectionActions]);

  useEffect(() => {
    const aborted = actionsAbortControllersRef.current.size;
    for (const controller of actionsAbortControllersRef.current) {
      controller.abort();
    }
    actionsAbortControllersRef.current.clear();
    actionsStatsRef.current.aborted += aborted;
    loadingActionIdsRef.current = new Set();
    setLoadingActionIds(new Set());
  }, [
    currencyFilter,
    filterChip,
    search,
    page,
    pageSize,
    report.periodStart,
    report.periodEnd,
  ]);

  useEffect(() => {
    const controllers = actionsAbortControllersRef.current;
    return () => {
      for (const controller of controllers) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  return (
    <section
      aria-label="Explorador de deuda por cliente"
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-[var(--copilot-shadow)]"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(44,40,37,0.06)]">
            <Users className="h-4 w-4 text-[var(--copilot-ink)]" aria-hidden />
          </span>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-[var(--copilot-ink)]">
              Explorador de deuda
              {currencyFilter ? (
                <span className="ml-2 inline-flex items-center rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink)] align-middle">
                  {currencyFilter}
                </span>
              ) : null}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              {formatCarteraInteger(baseClients.length)} cliente{baseClients.length === 1 ? "" : "s"} con deuda{" "}
              {currencyFilter ? `${currencyFilter} ` : ""}activa
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--copilot-ink-muted)]"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Buscar cliente…"
            value={rawSearch}
            onChange={handleSearchChange}
            aria-label="Buscar cliente"
            className="h-9 w-52 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 pl-8 pr-3 text-sm text-[var(--copilot-ink)] shadow-sm transition placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20"
          />
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--copilot-border)] px-5 py-3">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => handleFilterChip(chip.id)}
            className={[
              "inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition",
              filterChip === chip.id
                ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)]"
                : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]",
            ].join(" ")}
          >
            {chip.label}
          </button>
        ))}
        {!currencyFilter && withoutDebtCount > 0 && (
          <>
            <span className="mx-1 h-4 w-px self-center bg-[var(--copilot-border)]" aria-hidden />
            <button
              type="button"
              onClick={() => { setShowWithoutDebt((v) => !v); setPage(0); }}
              className={[
                "inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition",
                showWithoutDebt
                  ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)]"
                  : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]",
              ].join(" ")}
            >
              {showWithoutDebt ? "Ocultar sin deuda" : `Sin deuda (${withoutDebtCount})`}
            </button>
          </>
        )}
        {filtered.length !== baseClients.length && (
          <span className="ml-1 text-[11px] text-[var(--copilot-ink-muted)] tabular-nums">
            {formatCarteraInteger(filtered.length)} resultado{filtered.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Mobile cards (<640px) */}
      <div className="space-y-2 sm:hidden">
        {pageRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--copilot-border)] px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
            {currencyFilter
              ? `Sin clientes con saldo ${currencyFilter} para los filtros aplicados.`
              : "Sin clientes para los filtros aplicados."}
          </p>
        ) : (
          pageRows.map((client) => (
            <ClientMobileCard
              key={`m-${client.companyId}`}
              client={client}
              currencyFilter={currencyFilter}
              expanded={expandedIds.has(client.companyId)}
              actions={actionsByCompany.get(client.companyId) ?? []}
              onToggle={() => toggleExpand(client.companyId)}
              onOpenDrawer={() => {
                void loadCollectionActions([client.companyId], "drawer");
                setDrawerCompany({
                  id: client.companyId,
                  name: client.companyName ?? client.companyId,
                });
              }}
              reduce={!!reduce}
            />
          ))
        )}
      </div>

      {/* Table (≥640px) */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-[var(--copilot-border)] bg-[var(--copilot-card)]/95 backdrop-blur">
              <Th field="name" sort={effectiveSort} onSort={handleSort} className="w-[200px]">
                Cliente
              </Th>
              {(currencyFilter === null || currencyFilter === "UYU") && (
                <Th field="pendingUYU" sort={effectiveSort} onSort={handleSort} align="right">
                  Saldo UYU
                </Th>
              )}
              {(currencyFilter === null || currencyFilter === "USD") && (
                <Th field="pendingUSD" sort={effectiveSort} onSort={handleSort} align="right">
                  Saldo USD
                </Th>
              )}
              <Th field="aging" sort={effectiveSort} onSort={handleSort}>
                Atraso
              </Th>
              <Th field="risk" sort={effectiveSort} onSort={handleSort}>
                Estado
              </Th>
              <Th field="invoices" sort={effectiveSort} onSort={handleSort} align="right">
                Facturas
              </Th>
              {/* Cobranza (sin sort — columna operativa) */}
              <th className="px-3 py-2.5 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
                  Cobranza
                </span>
              </th>
              {/* Expand toggle column (no sort) */}
              <th className="px-3 py-2.5" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--copilot-border)]">
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={currencyFilter ? 7 : 8}
                  className="py-8 text-center text-sm text-[var(--copilot-ink-muted)]"
                >
                  {currencyFilter
                    ? `Sin clientes con saldo ${currencyFilter} para los filtros aplicados.`
                    : "Sin clientes para los filtros aplicados."}
                </td>
              </tr>
            ) : (
              pageRows.map((client) => (
                <ClientRow
                  key={client.companyId}
                  client={client}
                  currencyFilter={currencyFilter}
                  expanded={expandedIds.has(client.companyId)}
                  actions={actionsByCompany.get(client.companyId) ?? []}
                  actionsLoaded={actionsByCompany.has(client.companyId)}
                  loadingActions={loadingActionIds.has(client.companyId)}
                  onToggle={() => toggleExpand(client.companyId)}
                  onPrefetch={() =>
                    void loadCollectionActions([client.companyId], "hover")
                  }
                  onOpenDrawer={() =>
                    {
                      void loadCollectionActions([client.companyId], "drawer");
                      setDrawerCompany({
                        id: client.companyId,
                        name: client.companyName ?? client.companyId,
                      });
                    }
                  }
                  reduce={!!reduce}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Collection Action Drawer */}
      {drawerCompany && (
        <CollectionActionDrawer
          companyId={drawerCompany.id}
          companyName={drawerCompany.name}
          open={drawerCompany !== null}
          onClose={() => setDrawerCompany(null)}
        />
      )}

      {/* Footer: pagination + page size */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--copilot-border)] px-5 py-3">
        <div className="flex items-center gap-2 text-[12px] text-[var(--copilot-ink-muted)]">
          <span>Filas:</span>
          {([25, 50, 100] as PageSize[]).map((ps) => (
            <button
              key={ps}
              type="button"
              onClick={() => { setPageSize(ps); setPage(0); }}
              className={[
                "inline-flex h-6 w-8 items-center justify-center rounded-md border text-[11px] font-semibold transition",
                pageSize === ps
                  ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)]"
                  : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 hover:text-[var(--copilot-ink)]",
              ].join(" ")}
            >
              {ps}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[12px] text-[var(--copilot-ink-muted)]">
          <span>
            {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} de{" "}
            {formatCarteraInteger(sorted.length)}
          </span>
          <button
            type="button"
            disabled={clampedPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
            aria-label="Página anterior"
          >
            <ChevronUp className="h-3.5 w-3.5 rotate-[-90deg]" aria-hidden />
          </button>
          <button
            type="button"
            disabled={clampedPage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
            aria-label="Página siguiente"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" aria-hidden />
          </button>
        </div>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Th — columna ordenable
// ---------------------------------------------------------------------------

function Th({
  children,
  field,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  field: SortField;
  sort: { field: SortField; dir: SortDir };
  onSort: (f: SortField) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.field === field;
  return (
    <th
      className={`px-3 py-2.5 ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={[
          "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition",
          active ? "text-[var(--copilot-ink)]" : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]",
        ].join(" ")}
      >
        {children}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden />
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// ClientRow + ExpandedRow
// ---------------------------------------------------------------------------

function ClientRow({
  client,
  currencyFilter,
  expanded,
  actions,
  actionsLoaded,
  loadingActions,
  onToggle,
  onPrefetch,
  onOpenDrawer,
  reduce,
}: {
  client: ClientStaleness;
  currencyFilter: ReconciliationCurrencyCode | null;
  expanded: boolean;
  actions: CollectionAction[];
  actionsLoaded: boolean;
  loadingActions: boolean;
  onToggle: () => void;
  onPrefetch: () => void;
  onOpenDrawer: () => void;
  reduce: boolean;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
  const risk = deriveRiskLevel(client);
  const riskCfg = RISK_BADGE[risk];
  const displayStatus = deriveClientDisplayStatus(client);
  const displayStatusCfg = CLIENT_DISPLAY_STATUS_BADGE[displayStatus];
  const latestAction = actions[0] ?? null;

  return (
    <>
      <tr
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        className={[
          "transition-colors",
          expanded ? "bg-[rgba(44,40,37,0.03)]" : "hover:bg-[rgba(44,40,37,0.02)]",
        ].join(" ")}
      >
        {/* Cliente */}
        <td className="max-w-[200px] px-3 py-2.5">
          <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">
            {client.companyName ?? client.companyId}
          </p>
        </td>

        {/* Saldo UYU — en modo USD muestra el consolidado (ambas monedas) cuando no hay filtro */}
        {(currencyFilter === null || currencyFilter === "UYU") && (
          <td className="px-3 py-2.5 text-right tabular-nums">
            {isUsd ? (
              (() => {
                const total = currencyFilter === null
                  ? convertToUsdEquivalent({ uyu: client.pendingByCurrency.UYU ?? 0, usd: client.pendingByCurrency.USD ?? 0 }, fxRate)
                  : convertToUsdEquivalent({ uyu: client.pendingByCurrency.UYU ?? 0, usd: 0 }, fxRate);
                return total > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold tabular-nums text-[var(--copilot-danger-text-strong)]">
                      {formatUsdEquivalent(total)}
                    </p>
                    <p className="text-[10px] text-[var(--copilot-ink-muted)]">TC {fxRate}</p>
                  </div>
                ) : (
                  <span className="text-[12px] text-[var(--copilot-ink-muted)]">—</span>
                );
              })()
            ) : (
              (client.pendingByCurrency.UYU ?? 0) > 0 ? (
                <span className="text-sm font-semibold text-[var(--copilot-danger-text-strong)]">
                  {formatCarteraMoney("UYU", client.pendingByCurrency.UYU ?? 0, { fractionDigits: 0 })}
                </span>
              ) : (
                <span className="text-[12px] text-[var(--copilot-ink-muted)]">—</span>
              )
            )}
          </td>
        )}

        {/* Saldo USD — suprimido en modo USD cuando el consolidado ya aparece en la celda UYU */}
        {(currencyFilter === null || currencyFilter === "USD") && (
          <td className="px-3 py-2.5 text-right tabular-nums">
            {isUsd && currencyFilter === null ? (
              <span className="text-[12px] text-[var(--copilot-ink-muted)]">—</span>
            ) : isUsd ? (
              (() => {
                const total = convertToUsdEquivalent({ uyu: 0, usd: client.pendingByCurrency.USD ?? 0 }, fxRate);
                return total > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold tabular-nums text-[var(--copilot-danger-text-strong)]">
                      {formatUsdEquivalent(total)}
                    </p>
                    <p className="text-[10px] text-[var(--copilot-ink-muted)]">TC {fxRate}</p>
                  </div>
                ) : (
                  <span className="text-[12px] text-[var(--copilot-ink-muted)]">—</span>
                );
              })()
            ) : (
              (client.pendingByCurrency.USD ?? 0) > 0 ? (
                <span className="text-sm font-semibold text-[var(--copilot-danger-text-strong)]">
                  {formatCarteraMoney("USD", client.pendingByCurrency.USD ?? 0)}
                </span>
              ) : (
                <span className="text-[12px] text-[var(--copilot-ink-muted)]">—</span>
              )
            )}
          </td>
        )}

        {/* Atraso real */}
        <td className="px-3 py-2.5">
          {(() => {
            const days = maxClientOverdueDays(client);
            return days != null ? (
              <span className="text-[12px] tabular-nums text-[var(--copilot-danger-text-strong)]">
                {formatOverdueDaysLabel(days)}
              </span>
            ) : (
              <span className="text-[12px] text-[var(--copilot-ink-muted)]">—</span>
            );
          })()}
        </td>

        {/* Estado del cliente — Pendiente / Atrasado / Crítico / Al día / Datos */}
        <td className="px-3 py-2.5">
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${displayStatusCfg.cls}`}
            title={`Riesgo derivado: ${riskCfg.label}`}
          >
            {displayStatusCfg.label}
          </span>
        </td>

        {/* Facturas */}
        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-[var(--copilot-ink-muted)]">
          {formatCarteraInteger(client.invoiceCount)}
        </td>

        {/* Cobranza — estado + botón acción */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {loadingActions ? (
              <span className="text-[11px] text-[var(--copilot-ink-muted)]">…</span>
            ) : latestAction ? (
              <CollectionStatusBadge action={latestAction} />
            ) : !actionsLoaded ? (
              <span className="text-[11px] text-[var(--copilot-ink-muted)]">Ver acción</span>
            ) : (
              <span className="text-[11px] text-[var(--copilot-ink-muted)]">Sin acción</span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenDrawer(); }}
              aria-label={`Registrar acción para ${client.companyName ?? client.companyId}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)] hover:border-[var(--copilot-accent)]"
            >
              <Plus className="h-2.5 w-2.5 text-[var(--copilot-ink-muted)]" aria-hidden />
            </button>
          </div>
        </td>

        {/* Toggle expand */}
        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Colapsar" : "Expandir"} ${client.companyName ?? client.companyId}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)]"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-[var(--copilot-ink-muted)]" aria-hidden />
            ) : (
              <ChevronRight className="h-3 w-3 text-[var(--copilot-ink-muted)]" aria-hidden />
            )}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={currencyFilter ? 7 : 8} className="px-3 pb-3 pt-0">
            <ExpandedRow
              client={client}
              currencyFilter={currencyFilter}
              actions={actions}
              reduce={reduce}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedRow({
  client,
  currencyFilter,
  actions,
  reduce,
}: {
  client: ClientStaleness;
  currencyFilter: ReconciliationCurrencyCode | null;
  actions: CollectionAction[];
  reduce: boolean;
}) {
  const currencies: ReconciliationCurrencyCode[] = currencyFilter
    ? [currencyFilter]
    : ["UYU", "USD"];
  const pendingCurrencies = currencies.filter(
    (c) => (client.pendingByCurrency[c] ?? 0) > 0
  );

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Saldos pendientes */}
        {pendingCurrencies.length > 0 ? (
          pendingCurrencies.map((c) => (
            <div key={c}>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--copilot-ink-muted)]/90">
                Deuda actual {c}
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                {formatCarteraMoney(c, client.pendingByCurrency[c] ?? 0, {
                  fractionDigits: c === "UYU" ? 0 : 2,
                })}
              </p>
            </div>
          ))
        ) : (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--copilot-ink-muted)]/90">
              Deuda actual
            </p>
            <p className="mt-0.5 text-sm text-[var(--copilot-success-text-strong)]">Sin deuda activa</p>
          </div>
        )}

        {/* Antigüedad dominante */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--copilot-ink-muted)]/90">
            Antigüedad dominante
          </p>
          <p className="mt-1">
            {client.dominantAgingRange ? (
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] ${AGING_BADGE[client.dominantAgingRange]}`}
              >
                {AGING_LABELS[client.dominantAgingRange]}
              </span>
            ) : (
              <span className="text-sm text-[var(--copilot-ink-muted)]">Sin clasificar</span>
            )}
          </p>
        </div>

        {/* Facturas / staleness */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--copilot-ink-muted)]/90">
            Facturas / actualización
          </p>
          <p className="mt-0.5 text-sm text-[var(--copilot-ink)]">
            {formatCarteraInteger(client.invoiceCount)} factura
            {client.invoiceCount === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-[var(--copilot-ink-muted)]">
            {STALE_BADGE[client.status].label} · {formatRelativeAgeHours(client.ageHours)}
          </p>
        </div>

        {/* Última actualización */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--copilot-ink-muted)]/90">
            Última factura actualizada
          </p>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            {client.lastInvoiceUpdatedAt
              ? new Date(client.lastInvoiceUpdatedAt).toLocaleString("es-UY", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Sin registro"}
          </p>
        </div>
      </div>

      {/* Detalle: facturas pendientes (qué factura, fecha, monto, aging) */}
      <PendingInvoicesDetail
        client={client}
        currencyFilter={currencyFilter}
      />

      {/* Timeline de cobranza */}
      {actions.length > 0 && (
        <div className="mt-4 border-t border-[var(--copilot-border)] pt-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--copilot-ink-muted)]/90">
            Acciones de cobranza
          </p>
          <ol className="space-y-2">
            {actions.slice(0, 5).map((action) => (
              <li
                key={action.id}
                className="flex items-start gap-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50 px-3 py-2"
              >
                <span
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${priorityDotCls[action.priority]}`}
                  aria-label={action.priority}
                >
                  {action.priority[0].toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-[var(--copilot-ink)]">
                      {COLLECTION_ACTION_TYPE_LABELS[action.actionType]}
                    </span>
                    <span className="text-[10px] text-[var(--copilot-ink-muted)]">
                      {COLLECTION_STATUS_LABELS[action.status]}
                    </span>
                    {action.nextActionDate && (
                      <span className={`text-[10px] tabular-nums ${isOverdue(action.nextActionDate) ? "text-[var(--copilot-danger-text)] font-semibold" : "text-[var(--copilot-ink-muted)]"}`}>
                        próx. {fmtDate(action.nextActionDate)}
                      </span>
                    )}
                  </div>
                  {action.notes && (
                    <p className="mt-0.5 truncate text-[11px] text-[var(--copilot-ink-muted)]">
                      {action.notes}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-[var(--copilot-ink-muted)] tabular-nums">
                  {fmtDate(action.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ClientMobileCard — vista compacta para mobile (<640px)
// ---------------------------------------------------------------------------

function ClientMobileCard({
  client,
  currencyFilter,
  expanded,
  actions,
  onToggle,
  onOpenDrawer,
  reduce,
}: {
  client: ClientStaleness;
  currencyFilter: ReconciliationCurrencyCode | null;
  expanded: boolean;
  actions: CollectionAction[];
  onToggle: () => void;
  onOpenDrawer: () => void;
  reduce: boolean;
}) {
  const { mode, fxRate: mobileCardFxRate } = useDisplayCurrency();
  const isMobileUsd = mode === "usd_equivalent";
  const displayStatus = deriveClientDisplayStatus(client);
  const displayStatusCfg = CLIENT_DISPLAY_STATUS_BADGE[displayStatus];
  const showUyu =
    (currencyFilter === null || currencyFilter === "UYU") &&
    (client.pendingByCurrency.UYU ?? 0) > 0;
  const showUsd =
    (currencyFilter === null || currencyFilter === "USD") &&
    (client.pendingByCurrency.USD ?? 0) > 0;
  const name = client.companyName ?? client.companyId;

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--copilot-ink)]">
            {name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${displayStatusCfg.cls}`}
            >
              {displayStatusCfg.label}
            </span>
            {client.dominantAgingRange ? (
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${AGING_BADGE[client.dominantAgingRange]}`}
              >
                {AGING_LABELS[client.dominantAgingRange]}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Colapsar" : "Expandir"} ${name}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          )}
        </button>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {isMobileUsd ? (
          (showUyu || showUsd) ? (
            <div>
              <dt className="text-[var(--copilot-ink-muted)]">Saldo (USD est.)</dt>
              <dd className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                {formatUsdEquivalent(convertToUsdEquivalent({
                  uyu: client.pendingByCurrency.UYU ?? 0,
                  usd: client.pendingByCurrency.USD ?? 0,
                }, mobileCardFxRate))}
                <span className="ml-1 text-[9px] font-normal text-[var(--copilot-ink-muted)]">
                  TC {mobileCardFxRate}
                </span>
              </dd>
            </div>
          ) : null
        ) : (
          <>
            {showUyu ? (
              <div>
                <dt className="text-[var(--copilot-ink-muted)]">Saldo UYU</dt>
                <dd className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {formatCarteraMoney("UYU", client.pendingByCurrency.UYU ?? 0, { fractionDigits: 0 })}
                </dd>
              </div>
            ) : null}
            {showUsd ? (
              <div>
                <dt className="text-[var(--copilot-ink-muted)]">Saldo USD</dt>
                <dd className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {formatCarteraMoney("USD", client.pendingByCurrency.USD ?? 0)}
                </dd>
              </div>
            ) : null}
          </>
        )}
        <div>
          <dt className="text-[var(--copilot-ink-muted)]">Facturas</dt>
          <dd className="tabular-nums text-[var(--copilot-ink)]">
            {formatCarteraInteger(client.invoiceCount)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--copilot-ink-muted)]">Última actualización</dt>
          <dd className="text-[var(--copilot-ink)]">
            {formatRelativeAgeHours(client.ageHours)}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDrawer();
        }}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--copilot-accent)] hover:underline"
      >
        <Plus className="h-3 w-3" aria-hidden /> Registrar acción
      </button>

      {expanded ? (
        <div className="mt-3 border-t border-[var(--copilot-border)] pt-3">
          <ExpandedRow
            client={client}
            currencyFilter={currencyFilter}
            actions={actions}
            reduce={reduce}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PendingInvoicesDetail — detalle de qué facturas componen el saldo
// ---------------------------------------------------------------------------

function PendingInvoicesDetail({
  client,
  currencyFilter,
}: {
  client: ClientStaleness;
  currencyFilter: ReconciliationCurrencyCode | null;
}) {
  const allLines = client.pendingInvoices ?? [];
  const filtered: PendingInvoiceLine[] = (
    currencyFilter
      ? allLines.filter((l) => l.currencyCode === currencyFilter)
      : allLines
  ).filter((l) => l.balance > 0);

  if (filtered.length === 0) return null;

  const grouped = new Map<ReconciliationCurrencyCode, PendingInvoiceLine[]>();
  for (const line of filtered) {
    const arr = grouped.get(line.currencyCode) ?? [];
    arr.push(line);
    grouped.set(line.currencyCode, arr);
  }

  return (
    <div className="mt-4 border-t border-[var(--copilot-border)] pt-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--copilot-ink-muted)]/90">
        Facturas que componen el saldo
      </p>
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([currency, lines]) => {
          const fractionDigits = currency === "UYU" ? 0 : 2;
          const visible = lines.slice(0, 8);
          const hidden = lines.length - visible.length;
          return (
            <div
              key={currency}
              className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50 px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--copilot-ink-muted)]">
                {currency}
              </p>
              <ul className="mt-1 space-y-1">
                {visible.map((line) => (
                  <li
                    key={line.invoiceId}
                    className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5 text-[11px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[var(--copilot-ink)]">
                      {line.invoiceNumber ?? "Factura sin número"}
                      {line.issueDate ? (
                        <span className="ml-1 text-[var(--copilot-ink-muted)]">
                          · {line.issueDate}
                        </span>
                      ) : null}
                      {line.agingRange ? (
                        <span className="ml-1 text-[var(--copilot-ink-muted)]">
                          · {AGING_LABELS[line.agingRange]}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-[var(--copilot-ink)]">
                      {formatCarteraMoney(currency, line.balance, { fractionDigits })}
                    </span>
                  </li>
                ))}
              </ul>
              {hidden > 0 ? (
                <p className="mt-1 text-[10px] italic text-[var(--copilot-ink-muted)]">
                  + {formatCarteraInteger(hidden)} factura
                  {hidden === 1 ? "" : "s"} más
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollectionStatusBadge — badge de estado para la columna cobranza
// ---------------------------------------------------------------------------

function CollectionStatusBadge({ action }: { action: CollectionAction }) {
  const cls = collectionStatusCls[action.status] ?? collectionStatusCls.pending_review;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] ${cls}`}
    >
      {COLLECTION_STATUS_LABELS[action.status]}
    </span>
  );
}

const collectionStatusCls: Record<string, string> = {
  pending_review:   "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 text-[var(--copilot-ink-muted)]",
  contacted:        "border-[var(--copilot-border)] bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)]",
  promised_payment: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  paid:             "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  disputed:         "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  escalated:        "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  paused:           "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 text-[var(--copilot-ink-muted)]",
};

const priorityDotCls: Record<string, string> = {
  low:    "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-success-text-strong)]",
  medium: "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  high:   "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  urgent: "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-danger-text-strong)]",
};

function isOverdue(isoDate: string): boolean {
  return new Date(isoDate) < new Date();
}

function fmtDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
