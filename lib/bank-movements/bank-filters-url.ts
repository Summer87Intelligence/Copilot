/**
 * FASE BANK-FILTERS-KPI-AND-HISTORY-USABILITY-001
 * Persistencia de filtros Banco ↔ URL (tab + período + query + chips).
 */
import {
  defaultBankPeriodState,
  parseBankPeriodSelectValue,
  type BankPeriodState,
} from "@/lib/bank-movements/bank-period";
import type { BankMovementsListFilters } from "@/lib/bank-movements/bank-movements-filters";
import { DEFAULT_BANK_MOVEMENTS_LIST_FILTERS } from "@/lib/bank-movements/bank-movements-filters";

export type BankUrlFilterState = {
  tab: string | null;
  period: BankPeriodState;
  filters: BankMovementsListFilters;
  page: number;
  pageSize: number;
  sort: string;
  kpiFocus: "none" | "pending" | "inflow" | "outflow" | "reviewed";
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseBankFiltersFromSearchParams(
  sp: URLSearchParams
): Pick<BankUrlFilterState, "period" | "filters" | "page" | "pageSize" | "sort" | "kpiFocus"> {
  let period = defaultBankPeriodState();
  const periodParam = sp.get("period");
  const monthParam = sp.get("month");
  const from = sp.get("from");
  const to = sp.get("to");

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    period = { kind: "month", year: y!, month: m! };
  } else if (from && to && YMD.test(from) && YMD.test(to)) {
    period = { kind: "custom", from, to };
  } else if (periodParam) {
    const parsed = parseBankPeriodSelectValue(
      periodParam.startsWith("preset:") || periodParam.startsWith("month:")
        ? periodParam
        : `preset:${periodParam}`
    );
    if (parsed) period = parsed;
  }

  const filters: BankMovementsListFilters = {
    ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
    period: "all", // rango real vía from/to resuelto
    text: sp.get("q") ?? sp.get("text") ?? "",
    currency: (["all", "UYU", "USD"].includes(sp.get("currency") ?? "")
      ? (sp.get("currency") as BankMovementsListFilters["currency"])
      : "all"),
    direction: (["all", "inflow", "outflow"].includes(sp.get("direction") ?? "")
      ? (sp.get("direction") as BankMovementsListFilters["direction"])
      : "all"),
    status: (["all", "pending", "matched", "ignored"].includes(sp.get("status") ?? "")
      ? (sp.get("status") as BankMovementsListFilters["status"])
      : "all"),
    amountMin: sp.get("amountMin") ?? "",
    amountMax: sp.get("amountMax") ?? "",
    amount: sp.get("amount") ?? "",
    duplicates: (["hide", "only", "all"].includes(sp.get("duplicates") ?? "")
      ? (sp.get("duplicates") as BankMovementsListFilters["duplicates"])
      : "hide"),
    source: (["all", "pdf", "excel", "csv"].includes(sp.get("source") ?? "")
      ? (sp.get("source") as BankMovementsListFilters["source"])
      : "all"),
    visibility: (["visible", "hidden", "all"].includes(sp.get("visibility") ?? "")
      ? (sp.get("visibility") as BankMovementsListFilters["visibility"])
      : "visible"),
    clientPresence: (["all", "with", "without"].includes(sp.get("client") ?? "")
      ? (sp.get("client") as BankMovementsListFilters["clientPresence"])
      : "all"),
    simpleStates: sp.get("simpleStates") ?? "",
  };

  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(sp.get("pageSize") ?? "25") || 25;
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;
  const sort = sp.get("sort") ?? "date_desc";
  const kpiFocusRaw = sp.get("kpi");
  const kpiFocus =
    kpiFocusRaw === "pending" ||
    kpiFocusRaw === "inflow" ||
    kpiFocusRaw === "outflow" ||
    kpiFocusRaw === "reviewed"
      ? kpiFocusRaw
      : "none";

  return { period, filters, page, pageSize, sort, kpiFocus };
}

export function bankFiltersToSearchParams(input: {
  tab?: string | null;
  period: BankPeriodState;
  filters: BankMovementsListFilters;
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  kpiFocus?: BankUrlFilterState["kpiFocus"];
  movementId?: string | null;
  view?: string | null;
}): URLSearchParams {
  const p = new URLSearchParams();
  if (input.tab) p.set("tab", input.tab);

  if (input.period.kind === "preset") {
    p.set("period", input.period.preset);
  } else if (input.period.kind === "month") {
    p.set(
      "month",
      `${input.period.year}-${String(input.period.month).padStart(2, "0")}`
    );
  } else {
    p.set("period", "custom");
    p.set("from", input.from);
    p.set("to", input.to);
  }

  const f = input.filters;
  if (f.text.trim()) p.set("q", f.text.trim());
  if (f.currency !== "all") p.set("currency", f.currency);
  if (f.direction !== "all") p.set("direction", f.direction);
  if (f.status !== "all") p.set("status", f.status);
  if (f.amountMin.trim()) p.set("amountMin", f.amountMin.trim());
  if (f.amountMax.trim()) p.set("amountMax", f.amountMax.trim());
  if (f.amount.trim()) p.set("amount", f.amount.trim());
  if (f.duplicates !== "hide") p.set("duplicates", f.duplicates);
  if (f.source !== "all") p.set("source", f.source);
  if (f.visibility !== "visible") p.set("visibility", f.visibility);
  if (f.clientPresence && f.clientPresence !== "all") p.set("client", f.clientPresence);
  if (f.simpleStates?.trim()) p.set("simpleStates", f.simpleStates.trim());

  if (input.page && input.page > 1) p.set("page", String(input.page));
  if (input.pageSize && input.pageSize !== 25) p.set("pageSize", String(input.pageSize));
  if (input.sort && input.sort !== "date_desc") p.set("sort", input.sort);
  if (input.kpiFocus && input.kpiFocus !== "none") p.set("kpi", input.kpiFocus);
  if (input.movementId) p.set("movementId", input.movementId);
  if (input.view) p.set("view", input.view);

  return p;
}
