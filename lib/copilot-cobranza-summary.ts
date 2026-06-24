import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CollectionAction } from "@/lib/copilot-collection-types";

export type CobranzaKpis = {
  totalDebtUyu: number;
  totalDebtUsd: number;
  totalOverdueUyu: number;
  totalOverdueUsd: number;
  clientsWithDebtCount: number;
  clientsOverdueCount: number;
  activePromisesCount: number;
};

export type OwnershipEntry = {
  userId: string;
  name: string;
  email: string;
};

export type CobranzaClientRow = {
  companyId: string;
  name: string;
  debtUyu: number;
  debtUsd: number;
  overdueUyu: number;
  overdueUsd: number;
  overdueDaysUyu: number | null;
  overdueDaysUsd: number | null;
  hasDebt: boolean;
  isOverdue: boolean;
  hasActiveAction: boolean;
  latestActionStatus: string | null;
  latestActionType: string | null;
  nextActionDate: string | null;
  activePromise: { date: string; amount: number | null; currency: string | null } | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** Agrupa collection actions por company_id → la más reciente primero. */
export function groupActionsByCompany(
  actions: CollectionAction[]
): Map<string, CollectionAction[]> {
  const map = new Map<string, CollectionAction[]>();
  for (const a of actions) {
    const list = map.get(a.companyId) ?? [];
    list.push(a);
    map.set(a.companyId, list);
  }
  return map;
}

export function computeCobranzaKpis(
  portfolioRows: ClientPortfolioRow[],
  collectionActions: CollectionAction[]
): CobranzaKpis {
  let totalDebtUyu = 0;
  let totalDebtUsd = 0;
  let totalOverdueUyu = 0;
  let totalOverdueUsd = 0;
  let clientsWithDebtCount = 0;
  let clientsOverdueCount = 0;

  for (const row of portfolioRows) {
    const hasDebt = (row.debt_uyu ?? 0) > 0 || (row.debt_usd ?? 0) > 0;
    const isOverdue = (row.overdue_uyu ?? 0) > 0 || (row.overdue_usd ?? 0) > 0;
    totalDebtUyu += row.debt_uyu ?? 0;
    totalDebtUsd += row.debt_usd ?? 0;
    totalOverdueUyu += row.overdue_uyu ?? 0;
    totalOverdueUsd += row.overdue_usd ?? 0;
    if (hasDebt) clientsWithDebtCount++;
    if (isOverdue) clientsOverdueCount++;
  }

  const today = new Date().toISOString().slice(0, 10);
  const activePromisesCount = collectionActions.filter(
    (a) => a.status === "promised_payment" && a.isActive && (a.promiseDate == null || a.promiseDate >= today)
  ).length;

  return {
    totalDebtUyu,
    totalDebtUsd,
    totalOverdueUyu,
    totalOverdueUsd,
    clientsWithDebtCount,
    clientsOverdueCount,
    activePromisesCount,
  };
}

export function buildCobranzaClientRows(
  portfolioRows: ClientPortfolioRow[],
  actionsByCompany: Map<string, CollectionAction[]>,
  ownershipByCompanyId?: Map<string, OwnershipEntry>
): CobranzaClientRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const rows: CobranzaClientRow[] = [];

  for (const row of portfolioRows) {
    const debtUyu = row.debt_uyu ?? 0;
    const debtUsd = row.debt_usd ?? 0;
    const overdueUyu = row.overdue_uyu ?? 0;
    const overdueUsd = row.overdue_usd ?? 0;
    const hasDebt = debtUyu > 0 || debtUsd > 0;
    const isOverdue = overdueUyu > 0 || overdueUsd > 0;

    const actions = actionsByCompany.get(row.company_id) ?? [];
    const activeActions = actions.filter((a) => a.isActive);
    const latest = activeActions[0] ?? null;

    const promise = activeActions.find(
      (a) =>
        a.status === "promised_payment" &&
        a.promiseDate != null &&
        a.promiseDate >= today
    );

    const ownership = ownershipByCompanyId?.get(row.company_id) ?? null;

    rows.push({
      companyId: row.company_id,
      name: row.name,
      debtUyu,
      debtUsd,
      overdueUyu,
      overdueUsd,
      overdueDaysUyu: row.overdue_days_uyu ?? null,
      overdueDaysUsd: row.overdue_days_usd ?? null,
      hasDebt,
      isOverdue,
      hasActiveAction: activeActions.length > 0,
      latestActionStatus: latest?.status ?? null,
      latestActionType: latest?.actionType ?? null,
      nextActionDate: latest?.nextActionDate ?? null,
      activePromise: promise
        ? {
            date: promise.promiseDate!,
            amount: promise.promiseAmount,
            currency: promise.promiseCurrency,
          }
        : null,
      assignedUserId: ownership?.userId ?? null,
      assignedUserName: ownership?.name ?? null,
      assignedUserEmail: ownership?.email ?? null,
      contactEmail: row.contact_email?.trim() || null,
      contactPhone: row.contact_phone?.trim() || null,
    });
  }

  // Sort: overdue first (by overdue amount desc), then with debt, then the rest
  rows.sort((a, b) => {
    const aOverdue = a.overdueUyu + a.overdueUsd;
    const bOverdue = b.overdueUyu + b.overdueUsd;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    const aDebt = a.debtUyu + a.debtUsd;
    const bDebt = b.debtUyu + b.debtUsd;
    return bDebt - aDebt;
  });

  return rows;
}
