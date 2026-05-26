/**
 * Generadores de eventos de notificación para los 5 tipos iniciales.
 * Todos son idempotentes: pueden llamarse desde crons sin crear duplicados.
 */
import { createNotificationIfNotExists } from "./create-notification";
import { businessMonthYm } from "./business-date";

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export type DueMilestone = "7d" | "3d" | "1d" | "today";

/** Maps daysUntilDue to the closest milestone bucket. */
export function computeTreasuryDueMilestone(daysUntilDue: number): DueMilestone {
  if (daysUntilDue <= 0) return "today";
  if (daysUntilDue === 1) return "1d";
  if (daysUntilDue <= 3) return "3d";
  return "7d";
}

/**
 * Builds the human-readable body for a treasury_payment_due notification.
 * Includes time suffix only for "today" and "1d" milestones when dueTime is provided.
 */
export function buildTreasuryDueBody(
  title: string,
  milestone: DueMilestone,
  daysUntilDue: number,
  dueTime?: string | null
): string {
  const timeStr = dueTime ? ` a las ${dueTime.slice(0, 5)}` : "";
  if (milestone === "today") return `${title} vence hoy${timeStr}.`;
  if (milestone === "1d") return `${title} vence mañana${timeStr}.`;
  return `${title} vence en ${daysUntilDue} días.`;
}

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

export type ClientOverdueBucket = "7d" | "30d" | "60d" | "90d";

/** Maps daysOverdue to the dedup bucket. Exported for testing. */
export function computeClientOverdueBucket(daysOverdue: number): ClientOverdueBucket {
  if (daysOverdue >= 90) return "90d";
  if (daysOverdue >= 60) return "60d";
  if (daysOverdue >= 30) return "30d";
  return "7d";
}

export async function notifyClientOverdue(opts: ClientOverdueOpts) {
  const bucket = computeClientOverdueBucket(opts.daysOverdue);
  // Month bucket prevents re-notifying daily while allowing a fresh alert each month.
  const yyyyMm = businessMonthYm(new Date());
  const amountStr = opts.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "client_overdue",
    severity: opts.daysOverdue >= 60 ? "critical" : "warning",
    title: "Cliente vencido",
    body: `${opts.clientName} tiene ${opts.currency} ${amountStr} vencido`,
    entity_type: "company",
    entity_id: opts.clientId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: `/copilot/clientes/${opts.clientId}`,
    dedup_key: `client_overdue:${opts.clientId}:${opts.currency}:${bucket}:${yyyyMm}`,
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
  dueTime?: string | null; // HH:mm or HH:mm:ss — optional
};

export async function notifyTreasuryPaymentDue(opts: TreasuryPaymentDueOpts) {
  const milestone = computeTreasuryDueMilestone(opts.daysUntilDue);
  const severity: "info" | "warning" = milestone === "7d" ? "info" : "warning";
  const body = buildTreasuryDueBody(opts.title, milestone, opts.daysUntilDue, opts.dueTime);
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "treasury_payment_due",
    severity,
    title: "Pago próximo",
    body,
    entity_type: "planned_cash_obligation",
    entity_id: opts.obligationId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: "/copilot/tesoreria?section=pagos",
    dedup_key: `treasury_payment_due:${opts.obligationId}:${opts.dueDate}:${milestone}`,
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
  const [y, m, d] = opts.dueDate.split("-");
  const formattedDate = `${d}/${m}/${y}`;
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "treasury_payment_overdue",
    severity: "critical",
    title: "Pago vencido",
    body: `${opts.title} está vencido desde el ${formattedDate}.`,
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
