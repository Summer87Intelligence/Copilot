/**
 * Filtros client-side para Banco → Movimientos y Conciliación.
 */
import {
  isAmountWithinTolerance,
  reconciliationMovementAmountCandidates,
  type ReconciliationConfidence,
  type ReconciliationSuggestion,
} from "@/lib/bank-movements/bank-movement-reconciliation";
import type {
  BankMovement,
  BankMovementDirection,
  BankMovementStatus,
} from "@/lib/bank-movements/bank-movements-types";
import { PERIOD_MONTH_OPTIONS } from "@/lib/copilot-datos-period-filter";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import { isBankMovementHistorical } from "@/lib/bank/canonical/historical-policy";

export type BankMovementsPeriodFilter = "all" | "current" | `${number}-${string}`;

/** Alcance temporal (FASE-3): operativo por defecto; histórico = anterior al corte. */
export type BankMovementsScopeFilter = "operational" | "historical" | "all";

/** Origen del extracto (derivado de metadata.parser / source_file). */
export type BankMovementSourceFilter = "all" | "pdf" | "excel" | "csv";

/** Filtro de duplicados de importación (misma operación vista por otro archivo). */
export type BankMovementDuplicatesFilter = "all" | "only" | "hide";

export type BankMovementsListFilters = {
  period: BankMovementsPeriodFilter;
  scope: BankMovementsScopeFilter;
  currency: "all" | "UYU" | "USD";
  status: "all" | "pending" | "matched" | "ignored";
  direction: "all" | BankMovementDirection;
  text: string;
  /** Búsqueda por monto exacto (tolerancia de moneda). */
  amount: string;
  /** Importe mínimo inclusive (mismo parseo flexible que `amount`). */
  amountMin: string;
  /** Importe máximo inclusive. */
  amountMax: string;
  duplicates: BankMovementDuplicatesFilter;
  source: BankMovementSourceFilter;
};

export type ReconciliationSuggestionFilter =
  | "all"
  | "with_suggestion"
  | ReconciliationConfidence
  | "none"
  | "matched"
  | "ignored";

export type ReconciliationViewFilters = {
  period: BankMovementsPeriodFilter;
  currency: "all" | "UYU" | "USD";
  suggestion: ReconciliationSuggestionFilter;
  direction: "all" | BankMovementDirection;
  text: string;
  amount: string;
};

export type ReconciliationListItem = {
  movement: BankMovement;
  suggestions: ReconciliationSuggestion[];
};

export type ReconciliationFilteredMeta = {
  pending_count: number;
  with_high_confidence: number;
  with_medium_confidence: number;
  without_suggestions: number;
  matched_count: number;
  ignored_count: number;
};

export const DEFAULT_BANK_MOVEMENTS_LIST_FILTERS: BankMovementsListFilters = {
  period: "all",
  scope: "operational",
  currency: "all",
  status: "all",
  direction: "all",
  text: "",
  amount: "",
  amountMin: "",
  amountMax: "",
  duplicates: "all",
  source: "all",
};

export const BANK_MOVEMENT_DUPLICATES_OPTIONS: ReadonlyArray<{
  value: BankMovementDuplicatesFilter;
  label: string;
}> = [
  { value: "all", label: "Todos" },
  { value: "only", label: "Solo duplicados" },
  { value: "hide", label: "Ocultar duplicados" },
];

export const BANK_MOVEMENT_SOURCE_OPTIONS: ReadonlyArray<{
  value: BankMovementSourceFilter;
  label: string;
}> = [
  { value: "all", label: "Todas" },
  { value: "pdf", label: "PDF" },
  { value: "excel", label: "Excel" },
  { value: "csv", label: "CSV" },
];

export const BANK_MOVEMENT_SCOPE_OPTIONS: ReadonlyArray<{
  value: BankMovementsScopeFilter;
  label: string;
}> = [
  { value: "operational", label: "Operativos" },
  { value: "historical", label: "Históricos" },
  { value: "all", label: "Todos" },
];

export const DEFAULT_RECONCILIATION_VIEW_FILTERS: ReconciliationViewFilters = {
  period: "current",
  currency: "all",
  suggestion: "with_suggestion",
  direction: "all",
  text: "",
  amount: "",
};

const CONFIDENCE_SORT_ORDER: Record<ReconciliationConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PENDING_STATUSES = new Set<BankMovementStatus>(["pending", "suggested", "needs_review"]);

export const BANK_MOVEMENT_PERIOD_OPTIONS: ReadonlyArray<{ value: BankMovementsPeriodFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "current", label: "Mes actual" },
  ...PERIOD_MONTH_OPTIONS.filter((month) => month.value >= 1 && month.value <= 7).map((month) => ({
    value: `2026-${String(month.value).padStart(2, "0")}` as BankMovementsPeriodFilter,
    label: `${month.label} 2026`,
  })),
];

export function isBankMovementsListFiltersActive(
  filters: BankMovementsListFilters,
  defaults: BankMovementsListFilters = DEFAULT_BANK_MOVEMENTS_LIST_FILTERS
): boolean {
  return (
    filters.period !== defaults.period ||
    filters.scope !== defaults.scope ||
    filters.currency !== defaults.currency ||
    filters.status !== defaults.status ||
    filters.direction !== defaults.direction ||
    filters.text.trim() !== "" ||
    filters.amount.trim() !== "" ||
    filters.amountMin.trim() !== "" ||
    filters.amountMax.trim() !== "" ||
    filters.duplicates !== defaults.duplicates ||
    filters.source !== defaults.source
  );
}

/**
 * Deriva el tipo de fuente del movimiento a partir de metadata del parser
 * (sin nueva consulta). CSV es raro en Santander pero se reconoce por nombre.
 */
export function deriveMovementSourceKind(
  movement: Pick<BankMovement, "metadata">
): Exclude<BankMovementSourceFilter, "all"> | "unknown" {
  const meta = movement.metadata && typeof movement.metadata === "object" ? movement.metadata : null;
  const parser = meta && typeof meta.parser === "string" ? meta.parser.toLowerCase() : "";
  const sourceFile =
    meta && typeof (meta as { source_file?: unknown }).source_file === "string"
      ? String((meta as { source_file: string }).source_file).toLowerCase()
      : "";
  const haystack = `${parser} ${sourceFile}`;
  if (haystack.includes("csv")) return "csv";
  if (haystack.includes("excel") || haystack.includes("xlsx") || haystack.includes("xls")) return "excel";
  if (haystack.includes("pdf")) return "pdf";
  return "unknown";
}

export function movementMatchesAmountRange(
  movement: Pick<BankMovement, "amount" | "direction" | "metadata" | "currency">,
  min: number | null,
  max: number | null
): boolean {
  if (min == null && max == null) return true;
  const resolved = resolveImportedBankMovementAmount(movement);
  if (min != null && resolved < min) return false;
  if (max != null && resolved > max) return false;
  return true;
}

/** ¿El movimiento pasa el filtro de alcance temporal (operativo/histórico/todos)? */
export function matchesMovementScope(
  movementDate: string,
  scope: BankMovementsScopeFilter
): boolean {
  if (scope === "all") return true;
  const historical = isBankMovementHistorical({ movement_date: movementDate });
  return scope === "historical" ? historical : !historical;
}

export function isReconciliationViewFiltersActive(
  filters: ReconciliationViewFilters,
  defaults: ReconciliationViewFilters = DEFAULT_RECONCILIATION_VIEW_FILTERS
): boolean {
  return (
    filters.period !== defaults.period ||
    filters.currency !== defaults.currency ||
    filters.suggestion !== defaults.suggestion ||
    filters.direction !== defaults.direction ||
    filters.text.trim() !== "" ||
    filters.amount.trim() !== ""
  );
}

export function reconciliationApiStatusFromSuggestion(
  suggestion: ReconciliationSuggestionFilter
): "pending" | "matched" | "ignored" {
  if (suggestion === "matched") return "matched";
  if (suggestion === "ignored") return "ignored";
  return "pending";
}

/**
 * Parsea un monto ingresado por el usuario para búsqueda flexible.
 */
export function normalizeAmountSearch(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (!hasComma && !hasDot) {
    const value = Number(cleaned);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (hasDot && !hasComma) {
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1]!.length === 3 && parts[0]!.length <= 4) {
      const scaled = Number(parts.join(""));
      if (Number.isFinite(scaled) && scaled > 0) return scaled;
    }
    const value = Number(cleaned);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const parts = cleaned.split(",");
  if (parts.length === 2 && parts[1]!.length === 3 && parts[0]!.length <= 4) {
    const scaled = Number(parts.join(""));
    if (Number.isFinite(scaled) && scaled > 0) return scaled;
  }

  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function matchesMovementPeriod(
  movementDate: string,
  period: BankMovementsPeriodFilter,
  now: Date = new Date()
): boolean {
  if (period === "all") return true;

  const ymd = movementDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);

  if (period === "current") {
    return year === now.getFullYear() && month === now.getMonth() + 1;
  }

  const periodMatch = /^(\d{4})-(\d{2})$/.exec(period);
  if (!periodMatch) return true;
  return year === Number(periodMatch[1]) && month === Number(periodMatch[2]);
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function movementStatusBucket(status: BankMovementStatus): "pending" | "matched" | "ignored" | "other" {
  if (status === "matched") return "matched";
  if (status === "ignored") return "ignored";
  if (PENDING_STATUSES.has(status)) return "pending";
  return "other";
}

export function movementMatchesAmountSearch(
  movement: Pick<BankMovement, "amount" | "direction" | "metadata" | "currency">,
  searchAmount: number
): boolean {
  const resolved = resolveImportedBankMovementAmount(movement);
  if (isAmountWithinTolerance(resolved, searchAmount, movement.currency).ok) return true;

  const candidates = reconciliationMovementAmountCandidates(movement);

  for (const candidate of candidates) {
    if (isAmountWithinTolerance(candidate, searchAmount, movement.currency).ok) return true;
  }

  if (searchAmount >= 100) {
    const decimalQuery = searchAmount / 1000;
    for (const candidate of candidates) {
      if (candidate >= 100) continue;
      if (Math.abs(candidate - decimalQuery) < 0.01) return true;
    }
  }

  if (searchAmount > 0 && searchAmount < 100) {
    const scaledQuery = Math.round(searchAmount * 1000 * 100) / 100;
    for (const candidate of candidates) {
      if (candidate < 100) continue;
      if (isAmountWithinTolerance(candidate, scaledQuery, movement.currency).ok) return true;
    }
  }

  return false;
}

export function movementMatchesTextSearch(
  movement: Pick<
    BankMovement,
    "description" | "raw_description" | "bank_reference" | "account_label" | "bank_name"
  >,
  text: string
): boolean {
  const query = normalizeSearchText(text);
  if (!query) return true;

  const haystack = normalizeSearchText(
    [movement.description, movement.raw_description, movement.bank_reference, movement.account_label, movement.bank_name]
      .filter(Boolean)
      .join(" ")
  );
  return haystack.includes(query);
}

export function filterBankMovements(
  movements: BankMovement[],
  filters: BankMovementsListFilters,
  now: Date = new Date(),
  /** IDs marcados como duplicado de importación (opcional; si no hay mapa, el filtro duplicates se ignora). */
  duplicateMovementIds?: ReadonlySet<string> | Readonly<Record<string, unknown>>
): BankMovement[] {
  const amountQuery = normalizeAmountSearch(filters.amount);
  const amountMin = normalizeAmountSearch(filters.amountMin);
  const amountMax = normalizeAmountSearch(filters.amountMax);
  const dupSet =
    duplicateMovementIds instanceof Set
      ? duplicateMovementIds
      : duplicateMovementIds
        ? new Set(Object.keys(duplicateMovementIds))
        : null;

  return movements.filter((movement) => {
    if (!matchesMovementScope(movement.movement_date, filters.scope)) return false;
    if (!matchesMovementPeriod(movement.movement_date, filters.period, now)) return false;
    if (filters.currency !== "all" && movement.currency !== filters.currency) return false;
    if (filters.direction !== "all" && movement.direction !== filters.direction) return false;

    if (filters.status !== "all") {
      const bucket = movementStatusBucket(movement.status);
      if (bucket !== filters.status) return false;
    }

    if (!movementMatchesTextSearch(movement, filters.text)) return false;
    if (amountQuery != null && !movementMatchesAmountSearch(movement, amountQuery)) return false;
    if (!movementMatchesAmountRange(movement, amountMin, amountMax)) return false;

    if (filters.source !== "all") {
      const kind = deriveMovementSourceKind(movement);
      if (kind !== filters.source) return false;
    }

    if (filters.duplicates !== "all" && dupSet) {
      const isDup = dupSet.has(movement.id);
      if (filters.duplicates === "only" && !isDup) return false;
      if (filters.duplicates === "hide" && isDup) return false;
    }

    return true;
  });
}

function reconciliationItemMatchesSuggestion(
  item: ReconciliationListItem,
  suggestion: ReconciliationSuggestionFilter
): boolean {
  if (suggestion === "all") return true;
  if (suggestion === "with_suggestion") {
    if (item.movement.status === "matched" || item.movement.status === "ignored") return false;
    return item.suggestions.length > 0;
  }
  if (suggestion === "matched") return item.movement.status === "matched";
  if (suggestion === "ignored") return item.movement.status === "ignored";

  if (item.movement.status === "matched" || item.movement.status === "ignored") return false;

  const best = item.suggestions[0];
  if (suggestion === "none") return !best;
  return best?.confidence === suggestion;
}

export function reconciliationItemMatchesTextSearch(item: ReconciliationListItem, text: string): boolean {
  const query = normalizeSearchText(text);
  if (!query) return true;

  if (movementMatchesTextSearch(item.movement, text)) return true;

  for (const suggestion of item.suggestions) {
    const targetText = normalizeSearchText(
      [suggestion.target.title, suggestion.target.description, suggestion.target.notes, ...suggestion.reasons]
        .filter(Boolean)
        .join(" ")
    );
    if (targetText.includes(query)) return true;
  }

  return false;
}

export function sortReconciliationItems(items: ReconciliationListItem[]): ReconciliationListItem[] {
  return [...items].sort((left, right) => {
    const leftBest = left.suggestions[0];
    const rightBest = right.suggestions[0];
    const leftRank = leftBest ? CONFIDENCE_SORT_ORDER[leftBest.confidence] : 99;
    const rightRank = rightBest ? CONFIDENCE_SORT_ORDER[rightBest.confidence] : 99;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftScore = leftBest?.score ?? 0;
    const rightScore = rightBest?.score ?? 0;
    if (leftScore !== rightScore) return rightScore - leftScore;
    return right.movement.movement_date.localeCompare(left.movement.movement_date);
  });
}

export function filterReconciliationItems(
  items: ReconciliationListItem[],
  filters: ReconciliationViewFilters,
  now: Date = new Date()
): ReconciliationListItem[] {
  const amountQuery = normalizeAmountSearch(filters.amount);

  const filtered = items.filter((item) => {
    const { movement } = item;
    if (!matchesMovementPeriod(movement.movement_date, filters.period, now)) return false;
    if (filters.currency !== "all" && movement.currency !== filters.currency) return false;
    if (filters.direction !== "all" && movement.direction !== filters.direction) return false;
    if (!reconciliationItemMatchesSuggestion(item, filters.suggestion)) return false;
    if (!reconciliationItemMatchesTextSearch(item, filters.text)) return false;
    if (amountQuery != null && !movementMatchesAmountSearch(movement, amountQuery)) return false;
    return true;
  });

  if (
    filters.suggestion === "with_suggestion" ||
    filters.suggestion === "high" ||
    filters.suggestion === "medium" ||
    filters.suggestion === "low"
  ) {
    return sortReconciliationItems(filtered);
  }

  return filtered;
}

export function computeReconciliationFilteredMeta(items: ReconciliationListItem[]): ReconciliationFilteredMeta {
  let with_high_confidence = 0;
  let with_medium_confidence = 0;
  let without_suggestions = 0;
  let matched_count = 0;
  let ignored_count = 0;
  let pending_count = 0;

  for (const item of items) {
    if (item.movement.status === "matched") matched_count += 1;
    else if (item.movement.status === "ignored") ignored_count += 1;
    else pending_count += 1;

    const best = item.suggestions[0];
    if (!best) without_suggestions += 1;
    else if (best.confidence === "high") with_high_confidence += 1;
    else if (best.confidence === "medium") with_medium_confidence += 1;
  }

  return {
    pending_count,
    with_high_confidence,
    with_medium_confidence,
    without_suggestions,
    matched_count,
    ignored_count,
  };
}

export function describeBankMovementsPeriodLabel(
  period: BankMovementsPeriodFilter,
  now: Date = new Date()
): string {
  if (period === "all") return "todos los períodos";
  if (period === "current") {
    const month = PERIOD_MONTH_OPTIONS.find((option) => option.value === now.getMonth() + 1)?.label;
    return month ? `${month} ${now.getFullYear()}` : "mes actual";
  }
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const month = PERIOD_MONTH_OPTIONS.find((option) => option.value === Number(match[2]))?.label;
  return month ? `${month} ${match[1]}` : period;
}
