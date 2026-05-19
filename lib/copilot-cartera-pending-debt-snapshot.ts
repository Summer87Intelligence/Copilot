/**
 * Snapshot de deuda pendiente por moneda para el drawer de Cartera.
 *
 * Fuente: `report.staleClients` (mismo origen que ClientDebtExplorer).
 * Sin recálculo de balances; solo filtra, ordena y agrega metadatos de UI.
 */

import type {
  AgingRange,
  ClientStaleness,
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
  StalenessStatus,
} from "@/lib/copilot-financial-reconciliation";

export type PendingDebtClientRow = {
  companyId: string;
  companyName: string | null;
  pendingAmount: number;
  invoiceCount: number;
  dominantAgingRange: AgingRange | null;
  status: StalenessStatus;
};

export type CurrentDebtSnapshot = {
  currency: ReconciliationCurrencyCode;
  totalPending: number;
  clientCount: number;
  clients: PendingDebtClientRow[];
  /** El reporte de reconciliación no incluye líneas por factura. */
  hasInvoiceDetail: false;
};

const PENDING_EPSILON = 0.005;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Clientes con saldo pendiente en `currency`, ordenados de mayor a menor deuda.
 * Equivalente operativo al subset del Explorador de deuda con filtro de moneda.
 */
export function buildCurrentDebtSnapshot(
  report: FinancialConsistencyReport,
  currency: ReconciliationCurrencyCode
): CurrentDebtSnapshot {
  const clients: PendingDebtClientRow[] = report.staleClients
    .filter((c) => (c.pendingByCurrency[currency] ?? 0) > PENDING_EPSILON)
    .map((c) => rowFromStaleness(c, currency))
    .sort((a, b) => b.pendingAmount - a.pendingAmount);

  const totalPending = roundMoney(
    clients.reduce((sum, c) => sum + c.pendingAmount, 0)
  );

  return {
    currency,
    totalPending,
    clientCount: clients.length,
    clients,
    hasInvoiceDetail: false,
  };
}

function rowFromStaleness(
  client: ClientStaleness,
  currency: ReconciliationCurrencyCode
): PendingDebtClientRow {
  return {
    companyId: client.companyId,
    companyName: client.companyName,
    pendingAmount: roundMoney(client.pendingByCurrency[currency] ?? 0),
    invoiceCount: client.invoiceCount,
    dominantAgingRange: client.dominantAgingRange,
    status: client.status,
  };
}
