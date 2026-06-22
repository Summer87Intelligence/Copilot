/**
 * Generadores de eventos de notificación operacionales.
 * Todos son idempotentes: pueden llamarse desde crons sin crear duplicados.
 */
import { createNotificationIfNotExists } from "./create-notification";
import { businessMonthYm } from "./business-date";
import {
  buildClientDebtSettledDedupKey,
  buildClientOverdueBody,
  buildInvoiceOverdueBody,
  buildInvoiceOverdueDedupKey,
  buildNewDebtorBody,
  buildNewDebtorDedupKey,
  buildPartialCollectionBody,
  buildClientDebtSettledBody,
  formatNotificationMoney,
} from "./notification-financial-events";

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
  /** Saldo pendiente tras el cobro (solo cobros parciales). */
  remainingBalance?: number | null;
  /** YYYY-MM-DD — fecha real del recibo en Zeta. */
  receiptDate?: string | null;
  /** YYYY-MM-DD — baseline de tesorería para la moneda del recibo. */
  treasuryBaselineDate?: string | null;
};

function buildCollectionMetadata(
  opts: CollectionReceivedOpts,
  eventKey: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    event_key: eventKey,
    client_name: opts.clientName,
    currency: opts.currency,
    amount: opts.amount,
    ...(opts.clientId ? { client_id: opts.clientId } : {}),
    receipt_id: opts.receiptId,
    ...extra,
  };
  if (opts.receiptDate) meta.receipt_date = opts.receiptDate;
  if (opts.treasuryBaselineDate) meta.treasury_baseline_date = opts.treasuryBaselineDate;
  if (opts.remainingBalance != null && opts.remainingBalance > 0) {
    meta.remaining_balance = opts.remainingBalance;
    meta.status = "partial";
  }
  return meta;
}

export async function notifyCollectionReceived(opts: CollectionReceivedOpts) {
  const isPartial = (opts.remainingBalance ?? 0) > 0;
  const dedupKey = `collection_received:${opts.receiptId}`;
  const title = isPartial ? "Cobro parcial recibido" : "Cobro recibido";
  const body = isPartial
    ? buildPartialCollectionBody(
        opts.clientName,
        opts.amount,
        opts.currency,
        opts.remainingBalance!
      )
    : `${opts.clientName} pagó ${formatNotificationMoney(opts.amount, opts.currency)}.`;

  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "collection_received",
    severity: "info",
    title,
    body,
    entity_type: "collection_receipt",
    entity_id: opts.receiptId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: opts.clientId
      ? `/copilot/clientes/${opts.clientId}`
      : "/copilot/cartera",
    dedup_key: dedupKey,
    metadata: buildCollectionMetadata(opts, dedupKey),
  });
}

type ClientDebtSettledOpts = {
  tenantCompanyId: string;
  clientId: string;
  clientName: string;
  currency: string;
  /** Monto del recibo que cerró la deuda — se muestra en el body. */
  amount?: number;
  receiptId?: string | null;
  /** YYYY-MM-DD — bucket diario de dedupe. */
  dateBucket: string;
  /** Si el cliente tenía deuda atrasada antes del pago. */
  hadOverdue?: boolean;
};

export async function notifyClientDebtSettled(opts: ClientDebtSettledOpts) {
  const dedupKey = buildClientDebtSettledDedupKey(opts.clientId, opts.dateBucket);
  const settledTitle =
    opts.amount && opts.amount > 0
      ? `Cliente saldó deuda · ${formatNotificationMoney(opts.amount, opts.currency)}`
      : "Cliente saldó su deuda";
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "client_debt_settled",
    severity: "info",
    title: settledTitle,
    body: buildClientDebtSettledBody(opts.clientName, {
      hadOverdue: opts.hadOverdue,
      amount: opts.amount,
      currency: opts.currency,
    }),
    entity_type: "company",
    entity_id: opts.clientId,
    amount: opts.amount ?? null,
    currency: opts.currency,
    action_href: `/copilot/clientes/${opts.clientId}`,
    dedup_key: dedupKey,
    metadata: {
      event_key: dedupKey,
      client_id: opts.clientId,
      client_name: opts.clientName,
      currency: opts.currency,
      amount: opts.amount ?? 0,
      remaining_balance: 0,
      ...(opts.receiptId ? { receipt_id: opts.receiptId } : {}),
      status: "settled",
    },
  });
}

type NewDebtorOpts = {
  tenantCompanyId: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  dateBucket: string; // YYYY-MM-DD — limita 1 notif por cliente+moneda por día
  invoiceId?: string | null;
};

export async function notifyNewDebtor(opts: NewDebtorOpts) {
  const dedupKey = buildNewDebtorDedupKey(opts.clientId, opts.currency, opts.dateBucket);
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "new_debtor",
    severity: "warning",
    title: `Nuevo saldo pendiente · ${formatNotificationMoney(opts.amount, opts.currency)}`,
    body: buildNewDebtorBody(opts.clientName, opts.amount, opts.currency),
    entity_type: "company",
    entity_id: opts.clientId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: `/copilot/clientes/${opts.clientId}`,
    dedup_key: dedupKey,
    metadata: {
      event_key: dedupKey,
      client_id: opts.clientId,
      client_name: opts.clientName,
      currency: opts.currency,
      amount: opts.amount,
      ...(opts.invoiceId ? { invoice_id: opts.invoiceId } : {}),
    },
  });
}

type ClientOverdueOpts = {
  tenantCompanyId: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  daysOverdue: number;
  /** Número de facturas vencidas agrupadas. Afecta el copy del body. */
  invoiceCount?: number;
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
  const dedupKey = `client_overdue:${opts.clientId}:${opts.currency}:${bucket}:${yyyyMm}`;
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "client_overdue",
    severity: opts.daysOverdue >= 60 ? "critical" : "warning",
    title: "Cliente atrasado",
    body: buildClientOverdueBody(opts.clientName, opts.amount, opts.currency, opts.invoiceCount),
    entity_type: "company",
    entity_id: opts.clientId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: `/copilot/clientes/${opts.clientId}`,
    dedup_key: dedupKey,
    metadata: {
      event_key: dedupKey,
      client_id: opts.clientId,
      client_name: opts.clientName,
      currency: opts.currency,
      amount: opts.amount,
      ...(opts.invoiceCount != null ? { invoice_count: opts.invoiceCount } : {}),
    },
  });
}

type InvoiceOverdueOpts = {
  tenantCompanyId: string;
  invoiceId: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
};

export async function notifyInvoiceOverdue(opts: InvoiceOverdueOpts) {
  const dedupKey = buildInvoiceOverdueDedupKey(
    opts.invoiceId,
    opts.clientId,
    opts.currency,
    opts.dueDate
  );
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "client_overdue",
    severity: opts.daysOverdue >= 60 ? "critical" : "warning",
    title: "Factura atrasada",
    body: buildInvoiceOverdueBody(opts.clientName, opts.amount, opts.currency),
    entity_type: "invoice",
    entity_id: opts.invoiceId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: `/copilot/clientes/${opts.clientId}`,
    dedup_key: dedupKey,
    metadata: {
      event_key: dedupKey,
      client_id: opts.clientId,
      client_name: opts.clientName,
      currency: opts.currency,
      amount: opts.amount,
      invoice_id: opts.invoiceId,
      due_date: opts.dueDate,
    },
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
    title: "Pago atrasado",
    body: `${opts.title} está atrasado desde el ${formattedDate}.`,
    entity_type: "planned_cash_obligation",
    entity_id: opts.obligationId,
    amount: opts.amount,
    currency: opts.currency,
    action_href: "/copilot/tesoreria?section=pagos",
    dedup_key: `treasury_payment_overdue:${opts.obligationId}:${opts.dueDate}`,
  });
}

// ─── Debt followup summary ───────────────────────────────────────────────────

/**
 * Título de la notificación resumen de deuda vencida. Exportado para tests.
 * Aparece una vez por día en la campana en lugar de N notificaciones individuales.
 * totalDisplay es el monto total pre-formateado (e.g. "USD 601") para escaneo ejecutivo.
 */
export function buildDebtFollowupSummaryTitle(
  overdueClientCount: number,
  totalDisplay?: string
): string {
  const n = overdueClientCount;
  const suffix = totalDisplay ? ` · ${totalDisplay}` : "";
  if (n === 1) return `1 cliente atrasado${suffix}`;
  return `${n} clientes atrasados${suffix}`;
}

export type DebtFollowupTopClient = {
  name: string;
  amountUYU: number;
  amountUSD: number;
};

/**
 * Cuerpo de la notificación resumen. Exportado para tests.
 * Muestra total atrasado clarificando que es entre N clientes (no por cliente),
 * y opcionalmente los principales deudores.
 */
export function buildDebtFollowupSummaryBody(
  uyuOverdue: number,
  usdOverdue: number,
  overdueClientCount?: number,
  topClients?: readonly DebtFollowupTopClient[]
): string {
  const parts: string[] = [];
  if (uyuOverdue > 0)
    parts.push(`UYU ${uyuOverdue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`);
  if (usdOverdue > 0)
    parts.push(`USD ${usdOverdue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`);

  if (parts.length === 0) return "Revisá principales deudores.";

  const n = overdueClientCount ?? 0;
  const clientSuffix = n > 0 ? ` entre ${n} cliente${n !== 1 ? "s" : ""}` : "";
  const totalLine = `Total atrasado: ${parts.join(" y ")}${clientSuffix}.`;

  if (!topClients?.length) return `${totalLine} Revisá principales deudores.`;

  const clientLines = topClients
    .slice(0, 3)
    .map((c) => {
      const amt: string[] = [];
      if (c.amountUYU > 0)
        amt.push(`UYU ${c.amountUYU.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`);
      if (c.amountUSD > 0)
        amt.push(`USD ${c.amountUSD.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`);
      return `• ${c.name} · ${amt.join(" / ")}`;
    })
    .join("\n");

  return `${totalLine}\n${clientLines}`;
}

type DebtFollowupSummaryOpts = {
  tenantCompanyId: string;
  overdueClientCount: number;
  uyuOverdue: number;
  usdOverdue: number;
  /** YYYY-MM-DD — bucket diario para dedupe. 1 resumen por día. */
  asOfYmd: string;
  topClients?: readonly DebtFollowupTopClient[];
  /** Monto total pre-formateado para incluir en el título (escaneo ejecutivo). */
  titleDisplay?: string;
};

export async function notifyDebtFollowupSummary(opts: DebtFollowupSummaryOpts) {
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "debt_followup_summary",
    severity: "warning",
    title: buildDebtFollowupSummaryTitle(opts.overdueClientCount, opts.titleDisplay),
    body: buildDebtFollowupSummaryBody(
      opts.uyuOverdue,
      opts.usdOverdue,
      opts.overdueClientCount,
      opts.topClients
    ),
    action_href: "/copilot/hoy#clientes-criticos",
    dedup_key: `debt_followup_summary:${opts.asOfYmd}`,
    metadata: {
      overdue_client_count: opts.overdueClientCount,
      top_clients: opts.topClients ?? [],
    },
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

// ─── Cash risk detected ───────────────────────────────────────────────────────

export type CashRiskCurrencyDetail = {
  currency: string;
  availableCash: number;
  committedOutflows: number;
  deficit: number;
};

type CashRiskDetectedOpts = {
  tenantCompanyId: string;
  /** YYYY-MM-DD — daily dedup bucket. */
  asOfYmd: string;
  affectedCurrencies: CashRiskCurrencyDetail[];
};

export function buildCashRiskBody(currencies: CashRiskCurrencyDetail[]): string {
  if (currencies.length === 1 && currencies[0].currency === "USD") {
    const deficit = Math.abs(currencies[0].deficit);
    const formatted = deficit.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `Faltan USD ${formatted} para cubrir compromisos próximos.`;
  }
  const parts = currencies.map((c) => {
    const deficit = Math.abs(c.deficit);
    return `${c.currency} déficit ${deficit.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  });
  return `Caja insuficiente para cubrir compromisos: ${parts.join(" · ")}. Revisá tesorería.`;
}

export async function notifyCashRiskDetected(opts: CashRiskDetectedOpts) {
  const body = buildCashRiskBody(opts.affectedCurrencies);
  const currencies = opts.affectedCurrencies.map((c) => c.currency).join(",");
  return createNotificationIfNotExists(opts.tenantCompanyId, {
    type: "cash_risk_detected",
    severity: "critical",
    title: "Riesgo de caja detectado",
    body,
    action_href: "/copilot/tesoreria",
    dedup_key: `cash_risk_detected:${opts.asOfYmd}:${currencies}`,
    metadata: {
      affected_currencies: opts.affectedCurrencies,
      as_of: opts.asOfYmd,
    },
  });
}
