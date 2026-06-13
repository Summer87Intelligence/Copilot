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
  PendingInvoiceLine,
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
  /** Facturas pendientes del cliente en la moneda del snapshot (top por saldo). */
  pendingInvoices: PendingInvoiceLine[];
};

export type CurrentDebtSnapshot = {
  currency: ReconciliationCurrencyCode;
  totalPending: number;
  clientCount: number;
  clients: PendingDebtClientRow[];
  /** `true` cuando el reporte expone líneas por factura por cliente. */
  hasInvoiceDetail: boolean;
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

  const hasInvoiceDetail = clients.some((c) => c.pendingInvoices.length > 0);

  return {
    currency,
    totalPending,
    clientCount: clients.length,
    clients,
    hasInvoiceDetail,
  };
}

function rowFromStaleness(
  client: ClientStaleness,
  currency: ReconciliationCurrencyCode
): PendingDebtClientRow {
  const pendingInvoices = (client.pendingInvoices ?? []).filter(
    (line) => line.currencyCode === currency
  );
  return {
    companyId: client.companyId,
    companyName: client.companyName,
    pendingAmount: roundMoney(client.pendingByCurrency[currency] ?? 0),
    invoiceCount: client.invoiceCount,
    dominantAgingRange: client.dominantAgingRange,
    status: client.status,
    pendingInvoices,
  };
}
