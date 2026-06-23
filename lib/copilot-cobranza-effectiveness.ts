import type { CollectionAction, CollectionStatus } from "@/lib/copilot-collection-types";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CobranzaHistoryRow } from "@/lib/copilot-cobranza-history";

export type CobranzaEffectivenessKpis = {
  activePromisesCount: number;
  overduePromisesCount: number;
  /** 0–100 integer, null when there are no closed promises to evaluate. */
  promiseFulfillmentRate: number | null;
  cobrosUyu: number;
  cobrosUsd: number;
  cobrosCount: number;
  clientsContactedCount: number;
  clientsWithDebtCount: number;
};

/** Statuses that indicate real contact was established with the client. */
const CONTACTED_STATUSES = new Set<CollectionStatus>([
  "contacted",
  "promised_payment",
  "paid",
  "disputed",
  "escalated",
]);

/** Active promises: waiting for payment on a future (or open) date. */
export function computeActivePromises(actions: CollectionAction[], today: string): number {
  return actions.filter(
    (a) =>
      a.status === "promised_payment" &&
      a.isActive &&
      (a.promiseDate == null || a.promiseDate >= today)
  ).length;
}

/** Overdue promises: promised payment date has passed and still not paid. */
export function computeOverduePromises(actions: CollectionAction[], today: string): number {
  return actions.filter(
    (a) =>
      a.status === "promised_payment" &&
      a.isActive &&
      a.promiseDate != null &&
      a.promiseDate < today
  ).length;
}

/**
 * Promise fulfilment rate (0–100).
 * Only evaluates closed promises: paid (kept) vs overdue (broken).
 * Active future promises are excluded — they haven't resolved yet.
 * Returns null when there are no closed promises to measure.
 */
export function computePromiseFulfillmentRate(
  actions: CollectionAction[],
  today: string
): number | null {
  const kept = actions.filter(
    (a) => a.isActive && a.status === "paid" && a.promiseDate != null
  ).length;
  const broken = actions.filter(
    (a) =>
      a.isActive &&
      a.status === "promised_payment" &&
      a.promiseDate != null &&
      a.promiseDate < today
  ).length;

  const total = kept + broken;
  if (total === 0) return null;
  return Math.round((kept / total) * 100);
}

/** Aggregate cobros from history rows (already filtered to a period by the API). */
export function aggregateMonthCobros(rows: CobranzaHistoryRow[]): {
  uyu: number;
  usd: number;
  count: number;
} {
  let uyu = 0;
  let usd = 0;
  for (const r of rows) {
    if (r.moneda === "UYU") uyu += r.monto;
    else if (r.moneda === "USD") usd += r.monto;
  }
  return {
    uyu: Math.round(uyu * 100) / 100,
    usd: Math.round(usd * 100) / 100,
    count: rows.length,
  };
}

/**
 * Clients with debt who have at least one active action with a real contact status.
 * "pending_review" and "paused" don't count as contacted.
 */
export function computeClientsContacted(
  actions: CollectionAction[],
  portfolioRows: ClientPortfolioRow[]
): number {
  const debtorIds = new Set(
    portfolioRows
      .filter((r) => (r.debt_uyu ?? 0) > 0 || (r.debt_usd ?? 0) > 0)
      .map((r) => r.company_id)
  );

  const contactedIds = new Set<string>();
  for (const a of actions) {
    if (a.isActive && CONTACTED_STATUSES.has(a.status)) {
      contactedIds.add(a.companyId);
    }
  }

  let count = 0;
  for (const id of debtorIds) {
    if (contactedIds.has(id)) count++;
  }
  return count;
}

export function computeEffectivenessKpis(
  actions: CollectionAction[],
  portfolioRows: ClientPortfolioRow[],
  monthHistoryRows: CobranzaHistoryRow[],
  today: string
): CobranzaEffectivenessKpis {
  const clientsWithDebtCount = portfolioRows.filter(
    (r) => (r.debt_uyu ?? 0) > 0 || (r.debt_usd ?? 0) > 0
  ).length;

  const { uyu, usd, count } = aggregateMonthCobros(monthHistoryRows);

  return {
    activePromisesCount: computeActivePromises(actions, today),
    overduePromisesCount: computeOverduePromises(actions, today),
    promiseFulfillmentRate: computePromiseFulfillmentRate(actions, today),
    cobrosUyu: uyu,
    cobrosUsd: usd,
    cobrosCount: count,
    clientsContactedCount: computeClientsContacted(actions, portfolioRows),
    clientsWithDebtCount,
  };
}
