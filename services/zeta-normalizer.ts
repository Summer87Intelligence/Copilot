/**
 * Mapeo conceptual Zeta → modelo financiero normalizado (Summer87).
 * Funciones puras; sin I/O ni acoplamiento a DashboardSnapshot ni Copilot Engine.
 *
 * Cuando exista contrato real con Zeta, este archivo es el lugar de ajustes
 * de nombres de campo, conversiones de unidad y reglas de default.
 */

import type {
  NormalizedCashMovement,
  NormalizedClient,
  NormalizedCollection,
  NormalizedExpense,
  NormalizedFinancePayload,
  NormalizedInvoice,
  NormalizedSupplier,
} from "@/types/normalized-finance";
import type {
  ZetaCashMovement,
  ZetaClient,
  ZetaCollection,
  ZetaExpense,
  ZetaInvoice,
  ZetaSupplier,
} from "@/types/zeta";

export function normalizeZetaInvoice(input: ZetaInvoice): NormalizedInvoice {
  return {
    externalId: input.zetaId,
    companyId: input.companyId,
    issueDate: input.issueDate,
    clientExternalId: input.clientZetaId,
    currency: input.currency,
    totalAmount: input.totalAmount,
    outstandingAmount: input.outstandingAmount,
    status: input.status,
  };
}

export function normalizeZetaCollection(
  input: ZetaCollection,
): NormalizedCollection {
  return {
    externalId: input.zetaId,
    companyId: input.companyId,
    collectionDate: input.collectionDate,
    currency: input.currency,
    amount: input.amount,
    invoiceExternalIds: input.invoiceZetaIds,
    clientExternalId: input.clientZetaId,
    status: input.status,
  };
}

export function normalizeZetaExpense(input: ZetaExpense): NormalizedExpense {
  return {
    externalId: input.zetaId,
    companyId: input.companyId,
    expenseDate: input.expenseDate,
    currency: input.currency,
    amount: input.amount,
    category: input.category,
    supplierExternalId: input.supplierZetaId,
    description: input.description,
  };
}

export function normalizeZetaCashMovement(
  input: ZetaCashMovement,
): NormalizedCashMovement {
  return {
    externalId: input.zetaId,
    companyId: input.companyId,
    movementDate: input.movementDate,
    currency: input.currency,
    amount: input.amount,
    kind: input.type,
    accountExternalId: input.accountZetaId,
    memo: input.memo,
  };
}

export function normalizeZetaClient(input: ZetaClient): NormalizedClient {
  return {
    externalId: input.zetaId,
    companyId: input.companyId,
    displayName: input.displayName,
    taxId: input.taxId,
    active: input.active,
  };
}

export function normalizeZetaSupplier(input: ZetaSupplier): NormalizedSupplier {
  return {
    externalId: input.zetaId,
    companyId: input.companyId,
    displayName: input.displayName,
    taxId: input.taxId,
    active: input.active,
  };
}

/**
 * Entrada de un lote tal como podría llegar de un futuro adaptador Zeta (listas parciales).
 * Todas las entidades deben pertenecer a la misma `companyId` para un snapshot coherente;
 * la validación cruzada queda para la capa siguiente.
 */
export type ZetaNormalizerBatchInput = {
  companyId: string;
  invoices?: ZetaInvoice[];
  collections?: ZetaCollection[];
  expenses?: ZetaExpense[];
  cashMovements?: ZetaCashMovement[];
  clients?: ZetaClient[];
  suppliers?: ZetaSupplier[];
  syncRunId?: string;
};

export function normalizeZetaPayload(
  input: ZetaNormalizerBatchInput,
): NormalizedFinancePayload {
  return {
    sourceSystem: "zeta",
    companyId: input.companyId,
    invoices: (input.invoices ?? []).map(normalizeZetaInvoice),
    collections: (input.collections ?? []).map(normalizeZetaCollection),
    expenses: (input.expenses ?? []).map(normalizeZetaExpense),
    cashMovements: (input.cashMovements ?? []).map(normalizeZetaCashMovement),
    clients: (input.clients ?? []).map(normalizeZetaClient),
    suppliers: (input.suppliers ?? []).map(normalizeZetaSupplier),
    syncRunId: input.syncRunId,
  };
}
