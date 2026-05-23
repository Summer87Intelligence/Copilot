/**
 * Generadores de eventos de notificación para los 5 tipos iniciales.
 * Todos son idempotentes: pueden llamarse desde crons sin crear duplicados.
 */
import { createNotificationIfNotExists } from "./create-notification";

type CollectionReceivedOpts = {
  tenantCompanyId: string;
  receiptId: string;
  clientName: string;
  amount: number;
  currency: string;
  clientId?: string | null;
};

export async function notifyCollectionReceived(opts: CollectionReceivedOpts) {
  const amountStr = opts.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "collection_received",
    severity: "info",
    title: "Cobro recibido",
    body: `${opts.clientName} pagó ${opts.currency} ${amountStr}`,
    entity_type: "collection_receipt",
    entity_id: opts.receiptId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: opts.clientId
      ? `/copilot/clientes/${opts.clientId}`
      : "/copilot/cartera",
    dedup_key: `collection_received:${opts.receiptId}`,
  });
}

type NewDebtorOpts = {
  tenantCompanyId: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  dateBucket: string; // YYYY-MM-DD — limita 1 notif por cliente por día
};

export async function notifyNewDebtor(opts: NewDebtorOpts) {
  const amountStr = opts.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "new_debtor",
    severity: "warning",
    title: "Nuevo cliente con deuda",
    body: `${opts.clientName} tiene ${opts.currency} ${amountStr} pendiente`,
    entity_type: "company",
    entity_id: opts.clientId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: `/copilot/clientes/${opts.clientId}`,
    dedup_key: `new_debtor:${opts.clientId}:${opts.dateBucket}`,
  });
}

type ClientOverdueOpts = {
  tenantCompanyId: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  daysOverdue: number;
};

export async function notifyClientOverdue(opts: ClientOverdueOpts) {
  const bucket =
    opts.daysOverdue >= 90 ? "90d"
    : opts.daysOverdue >= 60 ? "60d"
    : opts.daysOverdue >= 30 ? "30d"
    : "7d";
  const amountStr = opts.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "client_overdue",
    severity: opts.daysOverdue >= 60 ? "critical" : "warning",
    title: "Cliente vencido",
    body: `${opts.clientName} tiene ${opts.currency} ${amountStr} vencido hace más de ${opts.daysOverdue} días`,
    entity_type: "company",
    entity_id: opts.clientId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: `/copilot/clientes/${opts.clientId}`,
    dedup_key: `client_overdue:${opts.clientId}:${bucket}`,
  });
}

type TreasuryPaymentDueOpts = {
  tenantCompanyId: string;
  obligationId: string;
  title: string;
  amount: number;
  currency: string;
  dueDate: string;      // YYYY-MM-DD
  daysUntilDue: number;
};

export async function notifyTreasuryPaymentDue(opts: TreasuryPaymentDueOpts) {
  const bucket =
    opts.daysUntilDue <= 1 ? "1d"
    : opts.daysUntilDue <= 3 ? "3d"
    : "7d";
  const severity =
    opts.daysUntilDue <= 1 ? "critical"
    : opts.daysUntilDue <= 3 ? "warning"
    : "info";
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "treasury_payment_due",
    severity,
    title: "Pago próximo",
    body: `${opts.title} vence el ${opts.dueDate}`,
    entity_type: "planned_cash_obligation",
    entity_id: opts.obligationId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: "/copilot/tesoreria?section=pagos",
    dedup_key: `treasury_payment_due:${opts.obligationId}:${opts.dueDate}:${bucket}`,
  });
}

type TreasuryPaymentOverdueOpts = {
  tenantCompanyId: string;
  obligationId: string;
  title: string;
  amount: number;
  currency: string;
  dueDate: string; // YYYY-MM-DD
  daysOverdue: number;
};

export async function notifyTreasuryPaymentOverdue(opts: TreasuryPaymentOverdueOpts) {
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "treasury_payment_overdue",
    severity: opts.daysOverdue >= 7 ? "critical" : "warning",
    title: "Pago vencido",
    body: `${opts.title} venció el ${opts.dueDate} (hace ${opts.daysOverdue} días)`,
    entity_type: "planned_cash_obligation",
    entity_id: opts.obligationId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: "/copilot/tesoreria?section=pagos",
    dedup_key: `treasury_payment_overdue:${opts.obligationId}:${opts.dueDate}`,
  });
}

type SyncChangesDetectedOpts = {
  tenantCompanyId: string;
  changesSummary: string;
  dateBucket: string; // YYYY-MM-DD — 1 notif por día de sync
};

export async function notifySyncChangesDetected(opts: SyncChangesDetectedOpts) {
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "sync_changes_detected",
    severity: "info",
    title: "Zeta actualizó datos",
    body: opts.changesSummary,
    action_href: "/copilot/hoy",
    dedup_key: `sync_changes:${opts.dateBucket}`,
  });
}
