/**
 * Lógica pura para eventos financieros de notificaciones.
 * Sin I/O — testeable sin mocks de Supabase.
 */

export type DebtLifecycleEventType = "new_debtor" | "client_debt_settled";

export type CollectionPaymentOutcome = "partial" | "settled";

export function formatNotificationMoney(amount: number, currency: string): string {
  const formatted = amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return `${currency} ${formatted}`;
}

export function buildNewDebtorDedupKey(
  clientId: string,
  currency: string,
  dateBucket: string
): string {
  return `new_debtor:${clientId}:${currency}:${dateBucket}`;
}

export function buildClientDebtSettledDedupKey(clientId: string, dateBucket: string): string {
  return `client_debt_settled:${clientId}:${dateBucket}`;
}

export function buildInvoiceOverdueDedupKey(
  invoiceId: string | null | undefined,
  clientId: string,
  currency: string,
  dueDate: string
): string {
  const id = String(invoiceId ?? "").trim();
  if (id) return `invoice_overdue:${id}`;
  return `invoice_overdue:${clientId}:${currency}:${dueDate}`;
}

export function buildPartialCollectionBody(
  clientName: string,
  amount: number,
  currency: string,
  remainingBalance: number
): string {
  return `${clientName} hizo un pago parcial.`;
}

export function buildClientDebtSettledBody(
  clientName: string,
  opts?: { hadOverdue?: boolean; amount?: number; currency?: string }
): string {
  const amountStr =
    opts?.amount !== undefined && opts.amount > 0 && opts.currency
      ? formatNotificationMoney(opts.amount, opts.currency)
      : null;

  if (opts?.hadOverdue) {
    return amountStr
      ? `${clientName} pagó su deuda atrasada de ${amountStr}.`
      : `${clientName} pagó su deuda atrasada.`;
  }
  return amountStr ? `${clientName} pagó ${amountStr}.` : `${clientName} pagó su deuda.`;
}

export function buildNewDebtorBody(clientName: string, amount: number, currency: string): string {
  return `${clientName} registra deuda pendiente por ${formatNotificationMoney(amount, currency)}.`;
}

export function buildInvoiceOverdueBody(
  clientName: string,
  amount: number,
  currency: string
): string {
  return `${clientName} tiene ${formatNotificationMoney(amount, currency)} atrasado.`;
}

export function buildClientOverdueBody(
  clientName: string,
  amount: number,
  currency: string,
  invoiceCount?: number
): string {
  const money = formatNotificationMoney(amount, currency);
  if (invoiceCount != null && invoiceCount > 1) {
    return `${clientName} tiene ${invoiceCount} facturas con deuda atrasada por ${money}.`;
  }
  return `${clientName} tiene ${money} atrasado.`;
}

export function resolveCollectionPaymentOutcome(remainingBalance: number): CollectionPaymentOutcome {
  return remainingBalance > 0 ? "partial" : "settled";
}

export type DebtLifecycleState = {
  lastEventType: DebtLifecycleEventType | null;
};

type DebtLifecycleEntry = {
  lastEventType: DebtLifecycleEventType;
  createdAt: string;
};

/**
 * Decide si emitir new_debtor para un cliente+moneda.
 * - Re-emerge tras saldado (último evento = client_debt_settled).
 * - Primera deuda con actividad reciente de factura.
 * - No re-notifica deuda en curso (último evento = new_debtor).
 */
export function shouldNotifyNewDebtor(opts: {
  totalBalance: number;
  hasRecentInvoiceActivity: boolean;
  lifecycle: DebtLifecycleState;
}): boolean {
  if (opts.totalBalance <= 0) return false;
  if (opts.lifecycle.lastEventType === "new_debtor") return false;
  if (opts.lifecycle.lastEventType === "client_debt_settled") return true;
  return opts.hasRecentInvoiceActivity;
}

export function sumInvoiceBalances(
  invoices: ReadonlyArray<{ balance_amount?: unknown }>
): number {
  let total = 0;
  for (const inv of invoices) {
    const balance = Number(inv.balance_amount ?? 0);
    if (balance > 0) total += balance;
  }
  return total;
}

export function parseDebtLifecycleFromDedupKey(
  dedupKey: string
): { clientId: string; currency: string | null; eventType: DebtLifecycleEventType } | null {
  const key = dedupKey.trim();
  if (key.startsWith("new_debtor:")) {
    const parts = key.split(":");
    if (parts.length < 3) return null;
    return {
      eventType: "new_debtor",
      clientId: parts[1] ?? "",
      currency: parts[2] ?? null,
    };
  }
  if (key.startsWith("client_debt_settled:")) {
    const parts = key.split(":");
    if (parts.length < 2) return null;
    return {
      eventType: "client_debt_settled",
      clientId: parts[1] ?? "",
      currency: null,
    };
  }
  return null;
}

export function buildDebtLifecycleStateMap(
  rows: ReadonlyArray<{
    type: string;
    dedup_key: string | null;
    created_at: string;
    metadata?: Record<string, unknown> | null;
  }>
): Map<string, DebtLifecycleEntry> {
  const state = new Map<string, DebtLifecycleEntry>();

  for (const row of rows) {
    const eventType = row.type as DebtLifecycleEventType;
    if (eventType !== "new_debtor" && eventType !== "client_debt_settled") continue;

    const meta = row.metadata ?? {};
    const clientId = String(meta.client_id ?? "").trim();
    const currency = String(meta.currency ?? "").trim().toUpperCase();
    const parsed = row.dedup_key ? parseDebtLifecycleFromDedupKey(row.dedup_key) : null;

    const resolvedClientId = clientId || parsed?.clientId || "";
    if (!resolvedClientId) continue;

    const resolvedCurrency = currency || parsed?.currency || "";
    const mapKey =
      eventType === "new_debtor" && resolvedCurrency
        ? `${resolvedClientId}:${resolvedCurrency}`
        : resolvedClientId;

    const existing = state.get(mapKey);
    if (!existing || row.created_at > existing.createdAt) {
      state.set(mapKey, { lastEventType: eventType, createdAt: row.created_at });
    }
  }

  return state;
}

/** Elige el evento más reciente entre client+moneda y saldado a nivel cliente. */
export function resolveDebtLifecycleForClientCurrency(
  lifecycleMap: ReadonlyMap<string, DebtLifecycleEntry>,
  clientId: string,
  currency: string
): DebtLifecycleState {
  const currencyEntry = lifecycleMap.get(`${clientId}:${currency}`);
  const clientEntry = lifecycleMap.get(clientId);

  if (!currencyEntry && !clientEntry) return { lastEventType: null };
  if (!currencyEntry) return { lastEventType: clientEntry!.lastEventType };
  if (!clientEntry) return { lastEventType: currencyEntry.lastEventType };

  return currencyEntry.createdAt >= clientEntry.createdAt
    ? { lastEventType: currencyEntry.lastEventType }
    : { lastEventType: clientEntry.lastEventType };
}
