import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import {
  getOperatingDelayBucket,
  type OperatingDelayBucket,
} from "@/lib/copilot/operating-aging";
import {
  classifyInvoiceByIssueDate,
  type CollectionAgingBucket,
} from "@/lib/collection-aging/collection-aging-model";

export type CobranzaKpis = {
  totalDebtUyu: number;
  totalDebtUsd: number;
  totalOverdueUyu: number;
  totalOverdueUsd: number;
  /**
   * Subtotal "Atrasado" operativo por vencimiento (`due_date`), por moneda.
   * Subconjunto de totalDebt*.
   */
  collectionOverdueUyu: number;
  collectionOverdueUsd: number;
  clientsWithDebtCount: number;
  clientsOverdueCount: number;
  /** Clientes con saldo atrasado por fecha de vencimiento. */
  clientsCollectionOverdueCount: number;
  activePromisesCount: number;
};

/**
 * Bucket legacy por fecha de emisión.
 * Conservado para consumidores que aún no fueron migrados fuera del modelo
 * deprecated de cartera/clientes.
 */
export function portfolioRowCollectionBucket(
  row: Pick<ClientPortfolioRow, "oldest_open_invoice_issue_date">,
  referenceDate?: string | Date
): CollectionAgingBucket {
  const oldest = row.oldest_open_invoice_issue_date;
  if (typeof oldest !== "string" || oldest.length < 10) return "not_overdue";
  return classifyInvoiceByIssueDate(oldest, referenceDate).bucket;
}

/**
 * Bucket operativo por fecha de vencimiento.
 * Usa los días de atraso ya calculados por cartera a partir de `due_date`.
 */
export function portfolioRowOperatingDelayBucket(
  row: Pick<ClientPortfolioRow, "overdue_days_uyu" | "overdue_days_usd">
): OperatingDelayBucket {
  const days = [row.overdue_days_uyu, row.overdue_days_usd]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (days.length === 0) return "on_time";
  return getOperatingDelayBucket(Math.max(...days));
}

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
  /** Atrasado operativo por `due_date`. */
  collectionOverdueUyu: number;
  collectionOverdueUsd: number;
  /** Bucket operativo por mayor día de atraso (`due_date`). */
  collectionBucket: OperatingDelayBucket;
  /** Fecha de emisión de la factura abierta más antigua (YYYY-MM-DD). */
  oldestOpenInvoiceIssueDate: string | null;
  hasDebt: boolean;
  isOverdue: boolean;
  /** true si el bucket operativo no es `on_time`. */
  isCollectionOverdue: boolean;
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
  let collectionOverdueUyu = 0;
  let collectionOverdueUsd = 0;
  let clientsWithDebtCount = 0;
  let clientsOverdueCount = 0;
  let clientsCollectionOverdueCount = 0;

  for (const row of portfolioRows) {
    const hasDebt = (row.debt_uyu ?? 0) > 0 || (row.debt_usd ?? 0) > 0;
    const isOverdue = (row.overdue_uyu ?? 0) > 0 || (row.overdue_usd ?? 0) > 0;
    totalDebtUyu += row.debt_uyu ?? 0;
    totalDebtUsd += row.debt_usd ?? 0;
    totalOverdueUyu += row.overdue_uyu ?? 0;
    totalOverdueUsd += row.overdue_usd ?? 0;
    collectionOverdueUyu += row.overdue_uyu ?? 0;
    collectionOverdueUsd += row.overdue_usd ?? 0;
    if (hasDebt) clientsWithDebtCount++;
    if (isOverdue) clientsOverdueCount++;
    if (hasDebt && portfolioRowOperatingDelayBucket(row) !== "on_time") {
      clientsCollectionOverdueCount++;
    }
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
    collectionOverdueUyu,
    collectionOverdueUsd,
    clientsWithDebtCount,
    clientsOverdueCount,
    clientsCollectionOverdueCount,
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
    const collectionOverdueUyu = row.overdue_uyu ?? 0;
    const collectionOverdueUsd = row.overdue_usd ?? 0;
    const hasDebt = debtUyu > 0 || debtUsd > 0;
    const isOverdue = overdueUyu > 0 || overdueUsd > 0;
    const collectionBucket = hasDebt ? portfolioRowOperatingDelayBucket(row) : "on_time";
    const isCollectionOverdue = collectionBucket !== "on_time";

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
      collectionOverdueUyu,
      collectionOverdueUsd,
      collectionBucket,
      oldestOpenInvoiceIssueDate: row.oldest_open_invoice_issue_date ?? null,
      hasDebt,
      isOverdue,
      isCollectionOverdue,
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

// ---------------------------------------------------------------------------
// Filtros y subtotales operativos por due_date
// ---------------------------------------------------------------------------

/**
 * Filtro de la lista "Clientes a gestionar". El universo es clientes con deuda
 * abierta (cobranza no gestiona clientes sin deuda).
 *  - `all`          → todos los clientes con deuda.
 *  - `on_time`      → con deuda pero al día.
 *  - `late_*`       → por bucket de días de atraso.
 *  - `noAction`     → con deuda y sin gestión activa.
 */
export type CobranzaAgingFilter =
  | "all"
  | OperatingDelayBucket
  | "noAction";

export function applyCobranzaAgingFilter(
  rows: CobranzaClientRow[],
  filter: CobranzaAgingFilter
): CobranzaClientRow[] {
  switch (filter) {
    case "all":
      return rows.filter((r) => r.hasDebt);
    case "on_time":
    case "late_1_7":
    case "late_8_14":
    case "late_15_30":
    case "late_30_plus":
      return rows.filter((r) => r.hasDebt && r.collectionBucket === filter);
    case "noAction":
      return rows.filter((r) => r.hasDebt && !r.hasActiveAction);
    default:
      return rows;
  }
}

export type CobranzaSubtotals = {
  pendingUyu: number;
  pendingUsd: number;
  overdueUyu: number;
  overdueUsd: number;
};

/**
 * Subtotales por moneda sobre un conjunto de filas (p. ej. el filtrado actual).
 *  - Pendiente = toda deuda abierta.
 *  - Atrasado  = saldo abierto con `due_date` anterior al corte.
 * Nunca mezcla UYU y USD.
 */
export function sumCobranzaSubtotals(rows: CobranzaClientRow[]): CobranzaSubtotals {
  let pendingUyu = 0;
  let pendingUsd = 0;
  let overdueUyu = 0;
  let overdueUsd = 0;
  for (const r of rows) {
    pendingUyu += r.debtUyu;
    pendingUsd += r.debtUsd;
    overdueUyu += r.collectionOverdueUyu;
    overdueUsd += r.collectionOverdueUsd;
  }
  return { pendingUyu, pendingUsd, overdueUyu, overdueUsd };
}
