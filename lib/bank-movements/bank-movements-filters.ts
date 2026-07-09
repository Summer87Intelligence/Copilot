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

export type BankMovementsPeriodFilter = "all" | "current" | `${number}-${string}`;

export type BankMovementsListFilters = {
  period: BankMovementsPeriodFilter;
  currency: "all" | "UYU" | "USD";
  status: "all" | "pending" | "matched" | "ignored";
  direction: "all" | BankMovementDirection;
  text: string;
  amount: string;
};

export type ReconciliationSuggestionFilter =
  | "all"
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
  currency: "all",
  status: "all",
  direction: "all",
  text: "",
  amount: "",
};

export const DEFAULT_RECONCILIATION_VIEW_FILTERS: ReconciliationViewFilters = {
  period: "current",
  currency: "all",
  suggestion: "all",
  direction: "all",
  text: "",
  amount: "",
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
    filters.currency !== defaults.currency ||
    filters.status !== defaults.status ||
    filters.direction !== defaults.direction ||
    filters.text.trim() !== "" ||
    filters.amount.trim() !== ""
  );
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
  now: Date = new Date()
): BankMovement[] {
  const amountQuery = normalizeAmountSearch(filters.amount);

  return movements.filter((movement) => {
    if (!matchesMovementPeriod(movement.movement_date, filters.period, now)) return false;
    if (filters.currency !== "all" && movement.currency !== filters.currency) return false;
    if (filters.direction !== "all" && movement.direction !== filters.direction) return false;

    if (filters.status !== "all") {
      const bucket = movementStatusBucket(movement.status);
      if (bucket !== filters.status) return false;
    }

    if (!movementMatchesTextSearch(movement, filters.text)) return false;
    if (amountQuery != null && !movementMatchesAmountSearch(movement, amountQuery)) return false;
    return true;
  });
}

function reconciliationItemMatchesSuggestion(
  item: ReconciliationListItem,
  suggestion: ReconciliationSuggestionFilter
): boolean {
  if (suggestion === "all") return true;
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

export function filterReconciliationItems(
  items: ReconciliationListItem[],
  filters: ReconciliationViewFilters,
  now: Date = new Date()
): ReconciliationListItem[] {
  const amountQuery = normalizeAmountSearch(filters.amount);

  return items.filter((item) => {
    const { movement } = item;
    if (!matchesMovementPeriod(movement.movement_date, filters.period, now)) return false;
    if (filters.currency !== "all" && movement.currency !== filters.currency) return false;
    if (filters.direction !== "all" && movement.direction !== filters.direction) return false;
    if (!reconciliationItemMatchesSuggestion(item, filters.suggestion)) return false;
    if (!reconciliationItemMatchesTextSearch(item, filters.text)) return false;
    if (amountQuery != null && !movementMatchesAmountSearch(movement, amountQuery)) return false;
    return true;
  });
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
