"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus, Sparkles, EyeOff, Eye, X, Clock } from "lucide-react";

import { BankMovementsImportPanel } from "@/components/copilot/bank-movements/bank-movements-import-panel";
import { BankMovementsReconciliationPanel } from "@/components/copilot/bank-movements/bank-movements-reconciliation-panel";
import { BankClientNameLink } from "@/components/copilot/bank-movements/bank-client-name-link";
import { SimpleMovementAssociationPanel } from "@/components/copilot/bank-movements/simple-movement-association-panel";
import { SimpleReconciliationList } from "@/components/copilot/bank-movements/simple-reconciliation-list";
import { BankHistoryPanel } from "@/components/copilot/bank-movements/bank-history-panel";
import { BankSimpleFiltersBar } from "@/components/copilot/bank-movements/bank-simple-filters-bar";
import { buildBankReturnToQuery } from "@/lib/bank-movements/client-banking-navigation";
import { formatCopilotDateTime } from "@/lib/copilot-format";
import {
  BANK_MOVEMENT_DESCRIPTION_CLASS,
  BANK_MOVEMENT_DESCRIPTION_COMPACT_CLASS,
  getBankMovementDisplayDescription,
} from "@/lib/bank-movements/bank-movement-display";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import { paginate, pageAfterFilterChange } from "@/lib/ui/table-pagination-model";
import { nextSortState, sortRows, type SortState } from "@/lib/ui/table-sort-model";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  COPILOT_GRID_GAP,
  COPILOT_PAGE_GAP,
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotMetricLabelClass,
  copilotMetricValueClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  filterBankMovements,
  type BankMovementsListFilters,
} from "@/lib/bank-movements/bank-movements-filters";
import {
  defaultBankPeriodState,
  periodStateKey,
  resolveBankPeriodRange,
  type BankPeriodState,
} from "@/lib/bank-movements/bank-period";
import { getBankOperationalSummary } from "@/lib/bank-movements/bank-operational-summary";
import {
  bankFiltersToSearchParams,
  parseBankFiltersFromSearchParams,
} from "@/lib/bank-movements/bank-filters-url";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";
import { isBankMovementHistorical } from "@/lib/bank/canonical/historical-policy";
import type { MovementReconciliationLevel } from "@/lib/bank/canonical/movement-reconciliation-level-labels";
import { DUPLICATE_OF_IMPORT_LABEL } from "@/lib/bank/canonical/duplicate-import-audit-labels";
import {
  deriveSimpleMovementState,
  SIMPLE_MOVEMENT_STATE_LABEL,
} from "@/lib/bank-movements/simple-movement-association";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import {
  bankMovementsScopeFromAccessLevel,
  canMutateBankMovementRecord,
  mustForceBankInflowOnly,
} from "@/lib/auth/bank-movements-scope";
import {
  BANK_MOVEMENT_DIRECTION_LABELS,
  BANK_MOVEMENT_STATUS_LABELS,
  type BankMovement,
  type BankMovementDirection,
  type BankStatementImport,
} from "@/lib/bank-movements/bank-movements-types";

type BankTab = "importar" | "movimientos" | "conciliacion" | "historial";
type BankKpiFocus = "none" | "pending" | "inflow" | "outflow" | "reviewed";
type MovPageSize = 25 | 50 | 100;

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — navegación final:
 * Importar → Movimientos → Conciliación → Historial. Identificar/vincular desde
 * Movimientos abre la Conciliación unificada (no una página legacy paralela).
 */
const TABS: Array<{ id: BankTab; label: string; primary?: boolean }> = [
  { id: "importar", label: "Importar" },
  { id: "movimientos", label: "Movimientos" },
  { id: "conciliacion", label: "Conciliación", primary: true },
  { id: "historial", label: "Historial" },
];

type ListResponse<T> = { ok: boolean; data?: T[]; message?: string };
type WriteResponse = { ok: boolean; data?: BankMovement; error?: string };

const dateFormatter = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });
const DEFAULT_CONCILIATION_SIMPLE_STATES = "sin_cliente,pendiente";
function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  id: string | null;
  movement_date: string;
  description: string;
  amount: string;
  currency: "UYU" | "USD";
  direction: BankMovementDirection;
  account_label: string;
  bank_reference: string;
};

function emptyForm(): FormState {
  return {
    id: null,
    movement_date: todayYmd(),
    description: "",
    amount: "",
    currency: "UYU",
    direction: "inflow",
    account_label: "",
    bank_reference: "",
  };
}

function withForcedBankDirection(
  filters: BankMovementsListFilters,
  forceInflowOnly: boolean
): BankMovementsListFilters {
  return forceInflowOnly ? { ...filters, direction: "inflow" } : filters;
}

function defaultFiltersForTab(
  tab: BankTab,
  forceInflowOnly: boolean
): BankMovementsListFilters {
  const base = withForcedBankDirection(
    { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS },
    forceInflowOnly
  );
  if (tab === "conciliacion") {
    return { ...base, simpleStates: DEFAULT_CONCILIATION_SIMPLE_STATES };
  }
  return base;
}

function parseMovSortState(sort: string): SortState {
  if (sort === "date_asc") return { key: "date", direction: "asc" };
  if (sort === "amount_asc") return { key: "amount", direction: "asc" };
  if (sort === "amount_desc") return { key: "amount", direction: "desc" };
  return { key: "date", direction: "desc" };
}

function serializeMovSortState(sort: SortState): string {
  if (sort.key === "amount") return `amount_${sort.direction}`;
  return `date_${sort.direction}`;
}

function resolveInitialTab(searchParams: URLSearchParams): BankTab {
  const requestedTab = searchParams.get("tab");
  const direction = searchParams.get("direction");
  const movementIdParam = searchParams.get("movementId");
  const viewConsult =
    searchParams.get("view") === "consult" || requestedTab === "movimientos";
  if (viewConsult && movementIdParam) return "movimientos";
  if (
    direction === "inflow" ||
    requestedTab === "ingresos" ||
    requestedTab === "conciliacion" ||
    requestedTab === "reconciliation" ||
    Boolean(movementIdParam)
  ) {
    return "conciliacion";
  }
  if (
    requestedTab === "importar" ||
    requestedTab === "movimientos" ||
    requestedTab === "historial"
  ) {
    return requestedTab;
  }
  return "movimientos";
}

function buildInitialBankViewState(
  searchParams: URLSearchParams,
  forceInflowOnly: boolean
): {
  tab: BankTab;
  period: BankPeriodState;
  filters: BankMovementsListFilters;
  page: number;
  pageSize: MovPageSize;
  movSort: SortState;
  kpiFocus: BankKpiFocus;
  highlightMovementId: string | null;
  simpleAssociationMovementId: string | null;
} {
  const parsed = parseBankFiltersFromSearchParams(searchParams);
  const tab = resolveInitialTab(searchParams);
  const movementIdParam = searchParams.get("movementId");
  const viewConsult =
    searchParams.get("view") === "consult" || searchParams.get("tab") === "movimientos";
  const filters = withForcedBankDirection({ ...parsed.filters }, forceInflowOnly);

  if (tab === "conciliacion" && filters.simpleStates.trim() === "") {
    filters.simpleStates = DEFAULT_CONCILIATION_SIMPLE_STATES;
  }

  return {
    tab,
    period: parsed.period,
    filters,
    page: parsed.page,
    pageSize: parsed.pageSize as MovPageSize,
    movSort: parseMovSortState(parsed.sort),
    kpiFocus: parsed.kpiFocus,
    highlightMovementId: viewConsult ? movementIdParam : null,
    simpleAssociationMovementId: viewConsult ? null : movementIdParam,
  };
}

export function BankMovementsPageClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { modulePermissions } = useCopilotPermissions();
  // FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — el alcance real de
  // Banco (independiente de cualquier heurística por email) sale del
  // access_level efectivo del módulo `bank_movements`. `inflow_readonly` es un
  // nivel intermedio: puede leer, pero SOLO ingresos, y nunca puede mutar.
  const bankScope = bankMovementsScopeFromAccessLevel(modulePermissions["bank_movements"]);
  const forceInflowOnly = mustForceBankInflowOnly(bankScope);
  // Nunca confiar solo en el string de rol/nivel para habilitar mutaciones:
  // `canMutateBankMovementRecord` es la única fuente de verdad del scope, así
  // que `inflow_readonly` jamás puede colar un canWriteBank=true acá.
  const canWriteBank = canMutateBankMovementRecord(bankScope);
  const initialUrlStateRef = useRef<ReturnType<typeof buildInitialBankViewState> | null>(null);
  if (!initialUrlStateRef.current) {
    initialUrlStateRef.current = buildInitialBankViewState(searchParams, forceInflowOnly);
  }
  const initialUrlState = initialUrlStateRef.current;
  const [tab, setTab] = useState<BankTab>(initialUrlState.tab);
  // FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001 — panel solo desde
  // Conciliación (o deep-link / Ir a Conciliación que fuerza esa tab).
  const [simpleAssociationMovementId, setSimpleAssociationMovementId] = useState<string | null>(
    initialUrlState.simpleAssociationMovementId
  );
  const [highlightMovementId, setHighlightMovementId] = useState<string | null>(
    initialUrlState.highlightMovementId
  );
  const openSimpleAssociation = useCallback((movementId: string) => {
    setHighlightMovementId(null);
    setSimpleAssociationMovementId(movementId);
  }, []);

  const [tesoreriaOpen, setTesoreriaOpen] = useState(false);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [movementLevels, setMovementLevels] = useState<Record<string, MovementReconciliationLevel>>({});
  const [movementDuplicates, setMovementDuplicates] = useState<Record<string, { canonicalMovementId: string }>>({});
  const [movementClients, setMovementClients] = useState<
    Record<string, { clientCompanyId: string; clientName: string | null }>
  >({});
  const [imports, setImports] = useState<BankStatementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [period, setPeriod] = useState<BankPeriodState>(initialUrlState.period);
  const [movementFilters, setMovementFilters] = useState<BankMovementsListFilters>(
    initialUrlState.filters
  );
  const [kpiFocus, setKpiFocus] = useState<BankKpiFocus>(initialUrlState.kpiFocus);
  /** Filtro temporal tras “Ver movimientos nuevos” (import_batch_id). */
  const [newImportBatchIds, setNewImportBatchIds] = useState<string[] | null>(null);
  const [movPage, setMovPage] = useState(initialUrlState.page);
  const [movPageSize, setMovPageSize] = useState<MovPageSize>(initialUrlState.pageSize);
  const [movSort, setMovSort] = useState<SortState>(initialUrlState.movSort);

  const setSanitizedMovementFilters = useCallback(
    (
      next:
        | BankMovementsListFilters
        | ((prev: BankMovementsListFilters) => BankMovementsListFilters)
    ) => {
      setMovementFilters((prev) =>
        withForcedBankDirection(
          typeof next === "function" ? next(prev) : next,
          forceInflowOnly
        )
      );
    },
    [forceInflowOnly]
  );

  // `inflow_readonly` nunca debe poder filtrar por egresos: el filtro de
  // dirección se oculta en la UI (ver `hideDirectionFilter` abajo), pero
  // además se fuerza acá por si el estado quedó en otro valor (p. ej. un
  // cambio de permisos en caliente sin recargar la página).
  useEffect(() => {
    if (!forceInflowOnly) return;
    setMovementFilters((prev) =>
      prev.direction === "inflow" ? prev : { ...prev, direction: "inflow" }
    );
  }, [forceInflowOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [movementsRes, importsRes] = await Promise.all([
        fetch("/api/copilot/bank-movements"),
        fetch("/api/copilot/bank-movements/imports"),
      ]);
      const movementsJson = (await movementsRes.json()) as ListResponse<BankMovement> & {
        levels?: Record<string, MovementReconciliationLevel>;
        duplicates?: Record<string, { canonicalMovementId: string }>;
        clients?: Record<string, { clientCompanyId: string; clientName: string | null }>;
      };
      const importsJson = (await importsRes.json()) as ListResponse<BankStatementImport>;
      if (movementsJson.ok) {
        setMovements(movementsJson.data ?? []);
        setMovementLevels(movementsJson.levels ?? {});
        setMovementDuplicates(movementsJson.duplicates ?? {});
        setMovementClients(movementsJson.clients ?? {});
      }
      if (importsJson.ok) setImports(importsJson.data ?? []);
    } catch {
      // Estado vacío ya cubre el caso sin datos.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  /** Fecha de la importación exitosa (status "parsed") más reciente, para el bloque "Movimientos bancarios". */
  const lastSuccessfulImportAt = useMemo(() => {
    let latest: string | null = null;
    for (const imp of imports) {
      if (imp.status !== "parsed") continue;
      if (!latest || imp.imported_at > latest) latest = imp.imported_at;
    }
    return latest;
  }, [imports]);

  const periodRange = useMemo(() => resolveBankPeriodRange(period), [period]);

  const operationalSummary = useMemo(
    () =>
      getBankOperationalSummary({
        movements,
        from: periodRange.from,
        to: periodRange.to,
        duplicates: movementDuplicates,
        levels: movementLevels,
        direction: forceInflowOnly
          ? "inflow"
          : movementFilters.direction === "all"
            ? undefined
            : movementFilters.direction,
        currency:
          movementFilters.currency === "all" ? undefined : movementFilters.currency,
      }),
    [
      forceInflowOnly,
      movementDuplicates,
      movementFilters.currency,
      movementFilters.direction,
      movementLevels,
      movements,
      periodRange.from,
      periodRange.to,
    ]
  );

  const filteredMovements = useMemo(() => {
    const base = filterBankMovements(movements, movementFilters, new Date(), movementDuplicates, {
      dateRange: periodRange,
      clientsByMovementId: movementClients,
      levels: movementLevels,
    });
    if (!newImportBatchIds || newImportBatchIds.length === 0) return base;
    const batch = new Set(newImportBatchIds);
    return base.filter((m) => m.import_id != null && batch.has(m.import_id));
  }, [
    movementClients,
    movementDuplicates,
    movementFilters,
    movementLevels,
    movements,
    newImportBatchIds,
    periodRange,
  ]);

  useEffect(() => {
    if (!highlightMovementId || loading) return;
    const el = document.querySelector(`[data-row-id="${highlightMovementId}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlightMovementId, loading, filteredMovements]);

  // Reset de página cuando cambian los filtros (evita páginas fuera de rango).
  const movFilterSig = JSON.stringify({
    filters: movementFilters,
    period: periodStateKey(period),
    newImportBatchIds,
    pageSize: movPageSize,
  });
  const appliedMovSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (appliedMovSigRef.current === null) {
      appliedMovSigRef.current = movFilterSig;
      return;
    }
    if (appliedMovSigRef.current !== movFilterSig) {
      appliedMovSigRef.current = movFilterSig;
      setMovPage(pageAfterFilterChange());
    }
  }, [movFilterSig]);

  const sortedMovements = useMemo(
    () =>
      sortRows(
        filteredMovements,
        movSort.key === "date"
          ? (m) => m.movement_date
          : movSort.key === "amount"
            ? (m) => resolveImportedBankMovementAmount(m)
            : null,
        movSort.direction
      ),
    [filteredMovements, movSort]
  );
  const movPageResult = useMemo(
    () => paginate(sortedMovements, movPage, movPageSize),
    [movPage, movPageSize, sortedMovements]
  );

  const activeMovementIdForUrl =
    tab === "conciliacion"
      ? simpleAssociationMovementId
      : tab === "movimientos"
        ? highlightMovementId
        : null;
  const activeViewForUrl =
    tab === "movimientos" && highlightMovementId ? "consult" : null;
  const sortQuery = serializeMovSortState(movSort);
  const currentSearchString = searchParams.toString();

  const syncBankUrl = useCallback(
    (overrides?: { page?: number; pageSize?: MovPageSize }) => {
      const page = overrides?.page ?? movPage;
      const pageSize = overrides?.pageSize ?? movPageSize;
      const params = bankFiltersToSearchParams({
        tab,
        period,
        filters: movementFilters,
        from: periodRange.from,
        to: periodRange.to,
        page,
        pageSize,
        sort: sortQuery,
        kpiFocus,
        movementId: activeMovementIdForUrl,
        view: activeViewForUrl,
      });
      const nextQuery = params.toString();
      if (nextQuery === searchParams.toString()) return;
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      // Eager browser URL sync: App Router router.replace can no-op/revert
      // search-only updates here, which broke pagination e2e (page stays in state).
      if (typeof window !== "undefined") {
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== nextUrl) {
          window.history.replaceState(window.history.state, "", nextUrl);
        }
      }
    },
    [
      activeMovementIdForUrl,
      activeViewForUrl,
      kpiFocus,
      movPage,
      movPageSize,
      movementFilters,
      pathname,
      period,
      periodRange.from,
      periodRange.to,
      searchParams,
      sortQuery,
      tab,
    ]
  );

  const goToMovPage = useCallback(
    (page: number) => {
      setMovPage(page);
      syncBankUrl({ page });
    },
    [syncBankUrl]
  );

  const changeMovPageSize = useCallback(
    (size: MovPageSize) => {
      setMovPageSize(size);
      setMovPage(1);
      syncBankUrl({ page: 1, pageSize: size });
    },
    [syncBankUrl]
  );

  useEffect(() => {
    const params = bankFiltersToSearchParams({
      tab,
      period,
      filters: movementFilters,
      from: periodRange.from,
      to: periodRange.to,
      page: movPage,
      pageSize: movPageSize,
      sort: sortQuery,
      kpiFocus,
      movementId: activeMovementIdForUrl,
      view: activeViewForUrl,
    });
    const nextQuery = params.toString();
    if (nextQuery === currentSearchString) return;
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      // Eager browser URL sync: App Router router.replace can no-op/revert
      // search-only updates here, which broke pagination e2e (page stays in state).
      if (typeof window !== "undefined") {
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== nextUrl) {
          window.history.replaceState(window.history.state, "", nextUrl);
        }
      }
  }, [
    activeMovementIdForUrl,
    activeViewForUrl,
    currentSearchString,
    kpiFocus,
    movPage,
    movPageSize,
    movementFilters,
    pathname,
    period,
    periodRange.from,
    periodRange.to,
    sortQuery,
    tab,
  ]);

  const bankAccountLabel = useMemo(() => {
    const firstAccountLabel = movements.find((movement) => movement.account_label?.trim())
      ?.account_label;
    return firstAccountLabel?.trim() || "Cuenta Santander";
  }, [movements]);

  const resetKpiFocus = useCallback(() => {
    setKpiFocus("none");
    setSanitizedMovementFilters((prev) => ({
      ...prev,
      direction: forceInflowOnly ? "inflow" : DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.direction,
      status: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.status,
      simpleStates: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.simpleStates,
    }));
    setMovPage(1);
  }, [forceInflowOnly, setSanitizedMovementFilters]);

  const applyKpiFocus = useCallback(
    (nextFocus: Exclude<BankKpiFocus, "none">) => {
      setKpiFocus(nextFocus);
      setSanitizedMovementFilters((prev) => {
        const base: BankMovementsListFilters = {
          ...prev,
          status: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.status,
        };
        switch (nextFocus) {
          case "pending":
            return {
              ...base,
              direction: forceInflowOnly
                ? "inflow"
                : DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.direction,
              simpleStates: "sin_cliente",
            };
          case "inflow":
            return {
              ...base,
              direction: "inflow",
              simpleStates: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.simpleStates,
            };
          case "outflow":
            return {
              ...base,
              direction: "outflow",
              simpleStates: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.simpleStates,
            };
          case "reviewed":
            return {
              ...base,
              direction: forceInflowOnly
                ? "inflow"
                : DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.direction,
              simpleStates: "asociado,pendiente,ingreso_no_comercial",
            };
        }
      });
      setMovPage(1);
    },
    [forceInflowOnly, setSanitizedMovementFilters]
  );

  const clearFilters = useCallback(() => {
    setPeriod(defaultBankPeriodState());
    setKpiFocus("none");
    setNewImportBatchIds(null);
    setSanitizedMovementFilters(defaultFiltersForTab(tab, forceInflowOnly));
    setMovPage(1);
  }, [forceInflowOnly, setSanitizedMovementFilters, tab]);

  const moneyFmt = (n: number) =>
    numberFormatter.format(n);

  const kpiCards: Array<{
    focus: Exclude<BankKpiFocus, "none">;
    label: string;
    value: number;
    description?: string;
    amountLines?: string[];
  }> = [
    {
      focus: "pending",
      label: "Pendientes",
      value: operationalSummary.pendingIdentificationCount,
    },
    {
      focus: "inflow",
      label: "Entradas",
      value: operationalSummary.inflowCount,
      amountLines: [
        `UYU ${moneyFmt(operationalSummary.inflowAmountByCurrency.UYU)}`,
        `USD ${moneyFmt(operationalSummary.inflowAmountByCurrency.USD)}`,
      ],
    },
    {
      focus: "outflow",
      label: "Salidas",
      value: operationalSummary.outflowCount,
      amountLines: [
        `UYU ${moneyFmt(operationalSummary.outflowAmountByCurrency.UYU)}`,
        `USD ${moneyFmt(operationalSummary.outflowAmountByCurrency.USD)}`,
      ],
    },
    {
      focus: "reviewed",
      label: "Revisados",
      value: operationalSummary.reviewedCount,
      description: "Movimientos del período que ya recibieron una decisión.",
    },
  ];

  const periodDifference = {
    UYU:
      operationalSummary.inflowAmountByCurrency.UYU -
      operationalSummary.outflowAmountByCurrency.UYU,
    USD:
      operationalSummary.inflowAmountByCurrency.USD -
      operationalSummary.outflowAmountByCurrency.USD,
  };

  const submitForm = useCallback(async () => {
    if (!form) return;
    const amountNumber = Number(form.amount);
    if (!form.description.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      setFeedback({ tone: "error", message: "Completá descripción y un monto mayor a 0." });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        movement_date: form.movement_date,
        description: form.description.trim(),
        amount: amountNumber,
        currency: form.currency,
        direction: form.direction,
        account_label: form.account_label.trim() || null,
        bank_reference: form.bank_reference.trim() || null,
      };
      const res = await fetch(
        form.id ? `/api/copilot/bank-movements/${form.id}` : "/api/copilot/bank-movements",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo guardar el movimiento." });
        return;
      }
      setForm(null);
      setFeedback({ tone: "ok", message: form.id ? "Movimiento actualizado." : "Movimiento creado." });
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [form, load]);

  const historicalBadge = (m: BankMovement) =>
    isBankMovementHistorical(m) ? (
      <StatusBadge className="ml-1.5 align-middle" tone="neutral">
        Histórico
      </StatusBadge>
    ) : null;

  const movementAmountLabel = (m: BankMovement) =>
    `${m.currency} ${numberFormatter.format(resolveImportedBankMovementAmount(m))}`;

  const hideOrRestoreMovement = useCallback(
    async (m: BankMovement, action: "hide" | "restore") => {
      const hidden = isBankMovementUiHidden(m.metadata);
      if (action === "hide") {
        const hasAssociation =
          (m.direction === "inflow" &&
            movementLevels[m.id] &&
            movementLevels[m.id] !== "unidentified") ||
          m.status === "matched";
        const warn = hasAssociation
          ? "Este movimiento tiene una asociación existente. Ocultar no modifica la conciliación ni revoca la identificación.\n\n"
          : "";
        const reason = window.prompt(
          `${warn}Ocultar este movimiento de las vistas operativas (opcional: motivo). Dejá vacío para continuar sin motivo, o Cancelar para abortar.`
        );
        if (reason === null) return;
        try {
          const res = await fetch(`/api/copilot/bank-movements/${m.id}/hide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: reason.trim() || undefined }),
          });
          const json = (await res.json()) as WriteResponse;
          if (!res.ok || !json.ok) {
            setFeedback({ tone: "error", message: json.error ?? "No se pudo ocultar." });
            return;
          }
          setFeedback({ tone: "ok", message: "Movimiento oculto en el workspace." });
          void load();
        } catch {
          setFeedback({ tone: "error", message: "No se pudo ocultar." });
        }
        return;
      }
      if (!hidden) return;
      if (!window.confirm("¿Volver a mostrar este movimiento en las vistas operativas?")) return;
      try {
        const res = await fetch(`/api/copilot/bank-movements/${m.id}/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = (await res.json()) as WriteResponse;
        if (!res.ok || !json.ok) {
          setFeedback({ tone: "error", message: json.error ?? "No se pudo restaurar." });
          return;
        }
        setFeedback({ tone: "ok", message: "Movimiento visible otra vez." });
        void load();
      } catch {
        setFeedback({ tone: "error", message: "No se pudo restaurar." });
      }
    },
    [load, movementLevels]
  );

  // FASE BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — el estado visible de un
  // ingreso ya no es el legacy pending/matched/ignored: refleja el nivel real
  // (identificación + link + allocations), calculado en lote server-side.
  //
  // FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
  // — un duplicado de importación (misma operación real vista por otro
  // archivo/parser) nunca muestra el estado de reconciliación normal: no es
  // una operación real separada, así que ni "Sin identificar" ni ningún otro
  // nivel aplica.
  // FASE BANK-SIMPLE-MOVEMENT-TO-CLIENT-RESET-001 — la columna Estado usa el
  // vocabulario simple (sección 5), no los 8 niveles técnicos del motor real
  // (esos siguen existiendo y siguen alimentando Conciliación/Cliente 360,
  // solo dejan de ser lo primero que ve el usuario en Movimientos).
  const movementStatusLabel = (m: BankMovement): string => {
    if (movementDuplicates[m.id]) return DUPLICATE_OF_IMPORT_LABEL;
    if (m.direction !== "inflow") return BANK_MOVEMENT_STATUS_LABELS[m.status];
    const simple = deriveSimpleMovementState({
      direction: m.direction,
      status: m.status,
      isDuplicate: false,
      isHidden: false,
      level: movementLevels[m.id],
    });
    return simple ? SIMPLE_MOVEMENT_STATE_LABEL[simple] : BANK_MOVEMENT_STATUS_LABELS[m.status];
  };

  // FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001 — Movimientos es
  // solo consulta. La asignación vive exclusivamente en Conciliación.
  const goToReconciliation = useCallback(
    (movementId: string) => {
      setTab("conciliacion");
      openSimpleAssociation(movementId);
    },
    [openSimpleAssociation]
  );

  const renderMovementActions = (m: BankMovement) => {
    const isDup = Boolean(movementDuplicates[m.id]);
    const isHidden = isBankMovementUiHidden(m.metadata);
    const simple = deriveSimpleMovementState({
      direction: m.direction,
      status: m.status,
      isDuplicate: isDup,
      isHidden,
      level: movementLevels[m.id],
    });

    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {!isDup ? (
          <button
            type="button"
            onClick={() => goToReconciliation(m.id)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            data-bank-ver-movimiento
            aria-label="Ver movimiento completo"
          >
            Ver movimiento
          </button>
        ) : null}
        {isDup ? (
          <button
            type="button"
            onClick={() => goToReconciliation(movementDuplicates[m.id]?.canonicalMovementId ?? m.id)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            Ver evidencia
          </button>
        ) : null}
        {!isDup &&
        (simple === "sin_cliente" || simple === "pendiente") &&
        m.direction === "inflow" ? (
          <button
            type="button"
            onClick={() => goToReconciliation(m.id)}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            data-bank-go-to-reconciliation
          >
            Ir a Conciliación
          </button>
        ) : null}
        {canWriteBank ? (
          isHidden ? (
            <button
              type="button"
              onClick={() => void hideOrRestoreMovement(m, "restore")}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              aria-label="Volver a mostrar movimiento"
            >
              <Eye className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Volver a mostrar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void hideOrRestoreMovement(m, "hide")}
              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              aria-label="Ocultar movimiento"
            >
              <EyeOff className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Ocultar
            </button>
          )
        ) : null}
      </div>
    );
  };

  const movementColumns: CopilotResponsiveTableColumn<BankMovement>[] = [
    {
      key: "date",
      header: "Fecha",
      sortKey: "date",
      cellClassName: "whitespace-nowrap align-top",
      render: (m) => (
        <span>
          {formatDate(m.movement_date)}
          {historicalBadge(m)}
        </span>
      ),
    },
    {
      key: "desc",
      header: "Descripción Santander",
      cellClassName: `align-top ${BANK_MOVEMENT_DESCRIPTION_CLASS}`,
      render: (m) => (
        <div>
          <span className={BANK_MOVEMENT_DESCRIPTION_CLASS}>{getBankMovementDisplayDescription(m)}</span>
          {m.bank_reference ? (
            <span className={`mt-1 block ${copilotCaptionClass}`}>Ref: {m.bank_reference}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "source",
      header: "Fuente",
      className: "hidden sm:table-cell",
      cellClassName: "hidden align-top sm:table-cell",
      render: (m) => m.account_label ?? m.bank_name,
    },
    {
      key: "client",
      header: "Cliente",
      cellClassName: "align-top",
      render: (m) => {
        const client = movementClients[m.id];
        if (!client?.clientCompanyId || !client.clientName) return "—";
        return (
          <BankClientNameLink
            clientCompanyId={client.clientCompanyId}
            clientName={client.clientName}
            returnTo={buildBankReturnToQuery({
              tab: "movimientos",
              movementId: m.id,
              baseQuery: currentSearchString,
            })}
          />
        );
      },
    },
    {
      key: "in",
      header: "Entrada",
      sortKey: "amount",
      className: "text-right",
      cellClassName: "whitespace-nowrap text-right align-top tabular-nums",
      render: (m) => (m.direction === "inflow" ? movementAmountLabel(m) : "—"),
    },
    {
      key: "out",
      header: "Salida",
      sortKey: "amount",
      className: "text-right",
      cellClassName: "whitespace-nowrap text-right align-top tabular-nums",
      render: (m) => (m.direction === "outflow" ? movementAmountLabel(m) : "—"),
    },
    {
      key: "status",
      header: "Estado",
      cellClassName: "whitespace-nowrap align-top",
      render: (m) => (
        <span>
          {movementStatusLabel(m)}
          {isBankMovementUiHidden(m.metadata) ? (
            <StatusBadge className="ml-1.5 align-middle" tone="neutral">
              Oculto
            </StatusBadge>
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      className: "text-right",
      cellClassName: "text-right align-top",
      render: (m) => renderMovementActions(m),
    },
  ];

  const renderMovementMobileCard = (m: BankMovement) => {
    const fullDescription = getBankMovementDisplayDescription(m);
    return (
    <div className="space-y-1.5" data-bank-movement-mobile-card={m.id}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--copilot-ink)]">
          {formatDate(m.movement_date)}
          {historicalBadge(m)}
        </span>
        <span
          className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
            m.direction === "inflow"
              ? "text-[var(--copilot-success-text-strong)]"
              : "text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {m.direction === "inflow" ? "+" : "−"} {movementAmountLabel(m)}
        </span>
      </div>
      <p
        className={`text-sm text-[var(--copilot-ink)] ${BANK_MOVEMENT_DESCRIPTION_COMPACT_CLASS}`}
        title={fullDescription}
        data-bank-movement-description-compact
      >
        {fullDescription}
      </p>
      {fullDescription.length > 120 ? (
        <p className={copilotCaptionClass}>Vista resumida — usá Ver movimiento para el texto completo.</p>
      ) : null}
      {m.bank_reference ? <p className={copilotCaptionClass}>Ref: {m.bank_reference}</p> : null}
      {movementClients[m.id]?.clientCompanyId && movementClients[m.id]?.clientName ? (
        <p className={copilotCaptionClass}>
          Cliente:{" "}
          <BankClientNameLink
            clientCompanyId={movementClients[m.id]!.clientCompanyId}
            clientName={movementClients[m.id]!.clientName!}
            returnTo={buildBankReturnToQuery({
              tab: "movimientos",
              movementId: m.id,
              baseQuery: currentSearchString,
            })}
          />
        </p>
      ) : null}
      <p className={copilotCaptionClass}>{movementStatusLabel(m)}</p>
      <div className="pt-1">{renderMovementActions(m)}</div>
    </div>
    );
  };

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Movimientos bancarios"
        description="Movimientos bancarios para revisar y conciliar manualmente."
        right={
          <span
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-[var(--copilot-text)]"
            data-testid="bank-last-import-updated-at"
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-muted)]" aria-hidden />
            {lastSuccessfulImportAt
              ? `Última actualización: ${formatCopilotDateTime(lastSuccessfulImportAt)}`
              : "Sin importaciones registradas"}
          </span>
        }
      />

      {feedback ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            feedback.tone === "ok"
              ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
              : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {tab !== "historial" ? (
        // Sección 13 — Historial muestra solo hechos terminados; estos KPIs
        // ("Pendientes de identificar", "Entradas/Salidas del mes") son estado
        // operativo actual, no un hecho histórico, así que no se muestran ahí.
        <div className="space-y-3">
          <div className={`grid grid-cols-2 lg:grid-cols-4 ${COPILOT_GRID_GAP}`}>
            {kpiCards.map((card) => {
              const active = kpiFocus === card.focus;
              return (
                <button
                  key={card.focus}
                  type="button"
                  title={card.description}
                  aria-pressed={active}
                  data-testid={`bank-kpi-${card.focus}`}
                  onClick={() => applyKpiFocus(card.focus)}
                  className={`${copilotCardStandardClass} text-left transition ${
                    active
                      ? "border-[var(--copilot-accent)] ring-2 ring-[var(--copilot-accent)]"
                      : "hover:border-[var(--copilot-accent)]/50"
                  }`}
                >
                  <p className={copilotMetricLabelClass} title={card.description}>
                    {card.label}
                  </p>
                  <p className={copilotMetricValueClass}>{loading ? "…" : card.value}</p>
                  {card.amountLines && !loading ? (
                    <div className={`${copilotCaptionClass} mt-1 space-y-0.5`}>
                      {card.amountLines.map((line) => (
                        <p key={line} className="tabular-nums">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <p className={copilotCaptionClass}>{periodRange.label}</p>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className={copilotCaptionClass}>
                {periodRange.label} · {bankAccountLabel}
              </p>
              <p className={copilotCaptionClass} title="Diferencia entre entradas y salidas del período.">
                Diferencia del período · UYU {numberFormatter.format(periodDifference.UYU)} · USD{" "}
                {numberFormatter.format(periodDifference.USD)}
              </p>
            </div>
            {kpiFocus !== "none" ? (
              <button
                type="button"
                onClick={resetKpiFocus}
                className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              >
                Restablecer vista
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav
        className="sticky top-0 z-[70] flex flex-wrap gap-2 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5 shadow-sm backdrop-blur"
        aria-label="Secciones de movimientos bancarios"
        data-bank-tabs
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={copilotButtonClassName({
              variant: tab === item.id ? "primary" : "ghost",
              size: "sm",
              className:
                tab === item.id
                  ? ""
                  : item.primary
                    ? "border-[var(--copilot-accent)] text-[var(--copilot-accent)] font-semibold"
                    : "!border-transparent",
            })}
          >
            {item.primary ? <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : null}
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "importar" ? (
        <BankMovementsImportPanel
          onImportComplete={load}
          onGoToMovements={() => {
            setNewImportBatchIds(null);
            setTab("movimientos");
          }}
          onViewNewMovements={(importIds) => {
            setNewImportBatchIds(importIds);
            setSanitizedMovementFilters((prev) => ({ ...prev, duplicates: "hide" }));
            setTab("movimientos");
          }}
        />
      ) : null}

      {tab === "movimientos" ? (
        <section className={copilotCardStandardClass}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={copilotSectionTitleClass}>Movimientos del banco</h2>
            {canWriteBank ? (
              <button
                type="button"
                onClick={() => setForm(form ? null : emptyForm())}
                className={copilotButtonClassName({ variant: "primary", size: "sm" })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                Agregar movimiento
              </button>
            ) : null}
          </div>

          {form && canWriteBank ? (
            <MovementForm
              form={form}
              submitting={submitting}
              onChange={setForm}
              onCancel={() => setForm(null)}
              onSubmit={submitForm}
            />
          ) : null}

          <div className="mt-4">
            <BankSimpleFiltersBar
              mode="movements"
              period={period}
              onPeriodChange={setPeriod}
              filters={movementFilters}
              onFiltersChange={setSanitizedMovementFilters}
              onClear={clearFilters}
              periodLabel={periodRange.label}
              canManageVisibility={canWriteBank}
              hideDirectionFilter={forceInflowOnly}
            />
          </div>

          {movements.length === 0 ? (
            <div className="mt-4">
              <DsEmptyState
                variant="compact"
                title={loading ? "Cargando movimientos" : "Todavía no hay movimientos bancarios"}
                description={
                  loading
                    ? "Estamos preparando el listado del banco."
                    : "En esta primera versión podés cargarlos manualmente. La importación automática queda para una próxima etapa."
                }
              />
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="mt-4">
              <DsEmptyState
                variant="compact"
                title="No hay movimientos con estos filtros"
                description="Probá limpiar filtros o revisar otra moneda, estado o dirección."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <CopilotResponsiveTable<BankMovement>
                rows={movPageResult.pageRows}
                columns={movementColumns}
                getRowKey={(m) => m.id}
                minWidth="820px"
                ariaLabel="Movimientos bancarios"
                mobileCard={renderMovementMobileCard}
                rowClassName={(m) =>
                  highlightMovementId === m.id
                    ? "ring-2 ring-[var(--copilot-accent)] bg-[var(--copilot-soft-bg)]"
                    : ""
                }
                sort={{
                  state: movSort,
                  onSort: (key) => setMovSort((prev) => nextSortState(prev, key)),
                }}
              />
              <TablePagination
                  page={movPageResult.safePage}
                  totalPages={movPageResult.totalPages}
                  from={movPageResult.from}
                  to={movPageResult.to}
                  total={movPageResult.total}
                  itemLabel="movimientos"
                  onPageChange={goToMovPage}
                  pageSize={movPageSize}
                  onPageSizeChange={(size) => changeMovPageSize(size as MovPageSize)}
                />
            </div>
          )}
        </section>
      ) : null}

      {tab === "movimientos" && !forceInflowOnly ? (
        <details
          open={tesoreriaOpen}
          onToggle={(e) => setTesoreriaOpen(e.currentTarget.open)}
          className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5"
        >
          <summary className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-[var(--copilot-muted)]">
            Pagos programados de Tesorería (no es conciliación de clientes)
          </summary>
          <div className="px-1 pb-1 pt-2">
            <BankMovementsReconciliationPanel onMovementUpdated={load} />
          </div>
        </details>
      ) : null}

      {tab === "conciliacion" ? (
        <div className="space-y-3">
          <section className={copilotCardStandardClass}>
            <BankSimpleFiltersBar
              mode="conciliation"
              period={period}
              onPeriodChange={setPeriod}
              filters={movementFilters}
              onFiltersChange={setSanitizedMovementFilters}
              onClear={clearFilters}
              periodLabel={periodRange.label}
              canManageVisibility={canWriteBank}
              hideDirectionFilter={forceInflowOnly}
            />
          </section>
          <SimpleReconciliationList
            movements={filteredMovements}
            movementLevels={movementLevels}
            movementDuplicates={movementDuplicates}
            movementClients={movementClients}
            canWriteBank={canWriteBank}
            onOpenAssociation={openSimpleAssociation}
            onRestore={(m) => void hideOrRestoreMovement(m, "restore")}
            pageSize={movPageSize}
            onPageSizeChange={(size) => changeMovPageSize(size as MovPageSize)}
            returnToSearch={currentSearchString}
          />
        </div>
      ) : null}

      {tab === "historial" ? (
        <div className="space-y-3">
          <section className={copilotCardStandardClass}>
            <BankSimpleFiltersBar
              mode="historial"
              period={period}
              onPeriodChange={setPeriod}
              filters={movementFilters}
              onFiltersChange={setSanitizedMovementFilters}
              onClear={clearFilters}
              periodLabel={periodRange.label}
              canManageVisibility={canWriteBank}
              hideDirectionFilter={forceInflowOnly}
            />
          </section>
          <BankHistoryPanel
            imports={imports}
            loading={loading}
            searchQuery={movementFilters.text}
            dateFrom={periodRange.from}
            dateTo={periodRange.to}
            periodLabel={periodRange.label}
          />
        </div>
      ) : null}

      {tab === "conciliacion" && simpleAssociationMovementId ? (
        <SimpleMovementAssociationPanel
          movementId={simpleAssociationMovementId}
          returnToSearch={currentSearchString}
          onClose={() => setSimpleAssociationMovementId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  );
}

function MovementForm({
  form,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  submitting: boolean;
  onChange: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="mt-4 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
          {form.id ? "Editar movimiento" : "Nuevo movimiento"}
        </h3>
        <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[var(--copilot-muted)]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Fecha</span>
          <input
            type="date"
            value={form.movement_date}
            onChange={(e) => onChange({ ...form, movement_date: e.target.value })}
            className={copilotInputClass}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Tipo</span>
          <select
            value={form.direction}
            onChange={(e) => onChange({ ...form, direction: e.target.value as BankMovementDirection })}
            className={copilotInputClass}
          >
            <option value="inflow">{BANK_MOVEMENT_DIRECTION_LABELS.inflow}</option>
            <option value="outflow">{BANK_MOVEMENT_DIRECTION_LABELS.outflow}</option>
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Descripción</span>
          <input
            type="text"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className={copilotInputClass}
            maxLength={500}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Monto</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => onChange({ ...form, amount: e.target.value })}
            className={copilotInputClass}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Moneda</span>
          <select
            value={form.currency}
            onChange={(e) => onChange({ ...form, currency: e.target.value as "UYU" | "USD" })}
            className={copilotInputClass}
          >
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Cuenta / fuente</span>
          <input
            type="text"
            value={form.account_label}
            onChange={(e) => onChange({ ...form, account_label: e.target.value })}
            className={copilotInputClass}
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Referencia banco</span>
          <input
            type="text"
            value={form.bank_reference}
            onChange={(e) => onChange({ ...form, bank_reference: e.target.value })}
            className={copilotInputClass}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          {submitting ? "Guardando…" : form.id ? "Guardar cambios" : "Crear movimiento"}
        </button>
      </div>
    </form>
  );
}
