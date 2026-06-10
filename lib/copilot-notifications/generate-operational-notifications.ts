import { createClient } from "@supabase/supabase-js";

import {
  notifyClientDebtSettled,
  notifyCollectionReceived,
  notifyDebtFollowupSummary,
  notifyInvoiceOverdue,
  notifyNewDebtor,
  notifyTreasuryPaymentDue,
  notifyTreasuryPaymentOverdue,
} from "./notification-events";
import { businessDateYmd } from "./business-date";
import {
  buildDebtLifecycleStateMap,
  resolveCollectionPaymentOutcome,
  resolveDebtLifecycleForClientCurrency,
  shouldNotifyNewDebtor,
  sumInvoiceBalances,
} from "./notification-financial-events";

// Lookback window for "collection received" notifications.
// Override via env for staging/testing without touching code.
export const COLLECTION_RECEIVED_LOOKBACK_HOURS = (() => {
  const raw = process.env.COPILOT_NOTIFICATIONS_COLLECTION_LOOKBACK_HOURS?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 72;
})();

export const NEW_DEBT_LOOKBACK_HOURS = (() => {
  const raw = process.env.COPILOT_NOTIFICATIONS_NEW_DEBT_LOOKBACK_HOURS?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return COLLECTION_RECEIVED_LOOKBACK_HOURS;
})();

type NotifResult = { ok: boolean; created: boolean };

type GenerateResult = {
  ok: boolean;
  created: number;
  skipped: number;
  byType: Record<string, { created: number; skipped: number }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

function getAdminClient(): AdminClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function todayYmd(now: Date): string {
  return businessDateYmd(now);
}

function futureDateYmd(now: Date, days: number): string {
  return businessDateYmd(new Date(now.getTime() + days * 86_400_000));
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round(
    (new Date(`${toYmd}T12:00:00Z`).getTime() - new Date(`${fromYmd}T12:00:00Z`).getTime()) /
      86_400_000
  );
}

function tally(acc: GenerateResult, type: string, result: NotifResult) {
  if (!acc.byType[type]) acc.byType[type] = { created: 0, skipped: 0 };
  if (result.created) {
    acc.created++;
    acc.byType[type].created++;
  } else {
    acc.skipped++;
    acc.byType[type].skipped++;
  }
}

// ─── Eligibility (mirrors treasury-scheduled-outflow-eligibility for raw DB rows) ───

/**
 * Mirrors resolveRecurringTemplateId() from treasury-scheduled-outflow-eligibility.ts
 * but works on raw PostgREST rows (snake_case columns, no mapping).
 */
function resolveTemplateIdFromRow(ob: Record<string, unknown>): string | null {
  const direct = String(ob.recurring_template_id ?? "").trim();
  if (direct) return direct;

  const meta = ob.metadata;
  if (meta && typeof meta === "object") {
    const fromMeta = String(
      (meta as Record<string, unknown>).recurring_template_id ?? ""
    ).trim();
    if (fromMeta) return fromMeta;
  }

  const key = String(ob.recurring_instance_key ?? "").trim();
  if (key.includes(":")) {
    const tpl = key.split(":")[0]?.trim();
    if (tpl) return tpl;
  }

  return null;
}

/**
 * Same logic as shouldIncludePlannedObligationInScheduledOutflow().
 * Excludes obligations that:
 *   - have affects_cashflow = false
 *   - belong to a paused/inactive recurring template
 */
function isObligationEligible(
  ob: Record<string, unknown>,
  inactiveTemplateIds: ReadonlySet<string>
): boolean {
  if (ob.affects_cashflow === false) return false;

  const templateId = resolveTemplateIdFromRow(ob);
  if (templateId && inactiveTemplateIds.has(templateId)) return false;

  return true;
}

const INACTIVE_TEMPLATE_LIMIT = 500;

/** Returns the set of template IDs where active = false for this workspace. */
async function loadInactiveTemplateIds(
  admin: AdminClient,
  workspaceId: string
): Promise<ReadonlySet<string>> {
  const { data, error } = await admin
    .from("planned_cash_obligation_templates")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("active", false)
    .limit(INACTIVE_TEMPLATE_LIMIT);

  if (error || !data) return new Set<string>();

  if (data.length >= INACTIVE_TEMPLATE_LIMIT) {
    console.warn(
      `[generate-notifications] loadInactiveTemplateIds hit limit (${INACTIVE_TEMPLATE_LIMIT}) for workspace ${workspaceId} — some inactive templates may be missed`
    );
  }

  const ids = new Set<string>();
  for (const t of data as Record<string, unknown>[]) {
    const id = String(t.id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

// ─── Treasury generators ──────────────────────────────────────────────────────

async function generateTreasuryDueNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  inactiveTemplateIds: ReadonlySet<string>,
  acc: GenerateResult
) {
  const today = todayYmd(now);
  const horizon = futureDateYmd(now, 7);

  const { data, error } = await admin
    .from("planned_cash_obligations")
    .select(
      "id, title, amount_estimated, amount_final, currency_code, due_date, due_time, status, " +
      "affects_cashflow, recurring_template_id, recurring_instance_key, metadata"
    )
    .eq("workspace_id", tenantCompanyId)
    .in("status", ["planned", "confirmed"])
    .gte("due_date", today)
    .lte("due_date", horizon)
    .order("due_date", { ascending: true })
    .limit(100);

  if (error || !data) return;

  for (const ob of (data as unknown) as Record<string, unknown>[]) {
    if (!isObligationEligible(ob, inactiveTemplateIds)) continue;
    const dueDate = String(ob.due_date ?? "").trim();
    if (!dueDate) continue;
    const daysUntilDue = daysBetween(today, dueDate);
    const dueTime = ob.due_time ? String(ob.due_time).trim() || null : null;
    const r = await notifyTreasuryPaymentDue({
      tenantCompanyId,
      obligationId: String(ob.id),
      title: String(ob.title ?? "Pago"),
      amount: Number(ob.amount_final ?? ob.amount_estimated ?? 0),
      currency: String(ob.currency_code ?? "UYU").toUpperCase(),
      dueDate,
      daysUntilDue,
      dueTime,
    });
    tally(acc, "treasury_payment_due", r);
  }
}

async function generateTreasuryOverdueNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  inactiveTemplateIds: ReadonlySet<string>,
  acc: GenerateResult
) {
  const today = todayYmd(now);

  const { data, error } = await admin
    .from("planned_cash_obligations")
    .select(
      "id, title, amount_estimated, amount_final, currency_code, due_date, status, " +
      "affects_cashflow, recurring_template_id, recurring_instance_key, metadata"
    )
    .eq("workspace_id", tenantCompanyId)
    .in("status", ["planned", "confirmed", "overdue"])
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(100);

  if (error || !data) return;

  for (const ob of (data as unknown) as Record<string, unknown>[]) {
    if (!isObligationEligible(ob, inactiveTemplateIds)) continue;
    const dueDate = String(ob.due_date ?? "").trim();
    if (!dueDate) continue;
    const daysOverdue = Math.max(0, daysBetween(dueDate, today));
    const r = await notifyTreasuryPaymentOverdue({
      tenantCompanyId,
      obligationId: String(ob.id),
      title: String(ob.title ?? "Pago"),
      amount: Number(ob.amount_final ?? ob.amount_estimated ?? 0),
      currency: String(ob.currency_code ?? "UYU").toUpperCase(),
      dueDate,
      daysOverdue,
    });
    tally(acc, "treasury_payment_overdue", r);
  }
}

// ─── Portfolio generators ─────────────────────────────────────────────────────

const OPEN_INVOICE_LIMIT = 2000;

async function loadCompanyNameMap(
  admin: AdminClient,
  tenantCompanyId: string,
  companyIds: string[]
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (companyIds.length === 0) return nameMap;

  const { data: companies } = await admin
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", tenantCompanyId)
    .in("id", companyIds.slice(0, 500));

  for (const c of (companies ?? []) as Record<string, unknown>[]) {
    nameMap.set(String(c.id), String(c.name ?? "Cliente"));
  }
  return nameMap;
}

async function loadClientOpenInvoiceBalances(
  admin: AdminClient,
  tenantCompanyId: string,
  companyId: string,
  currency?: string
): Promise<number> {
  let query = admin
    .from("proto_invoices")
    .select("balance_amount")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("company_id", companyId)
    .in("status", ["pending", "overdue", "partial"])
    .limit(500);

  if (currency) {
    query = query.eq("currency_code", currency);
  }

  const { data, error } = await query;
  if (error || !data) return 0;
  return sumInvoiceBalances(data as Record<string, unknown>[]);
}

async function generateInvoiceOverdueNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const today = todayYmd(now);

  const { data: invoices, error: iErr } = await admin
    .from("proto_invoices")
    .select("id, company_id, balance_amount, due_date, currency_code, status")
    .eq("workspace_company_id", tenantCompanyId)
    .in("status", ["pending", "overdue", "partial"])
    .limit(OPEN_INVOICE_LIMIT);

  if (iErr || !invoices) return;

  if (invoices.length >= OPEN_INVOICE_LIMIT) {
    console.warn(
      `[generate-notifications] generateInvoiceOverdueNotifications hit invoice limit (${OPEN_INVOICE_LIMIT}) for workspace ${tenantCompanyId}`
    );
  }

  const companyIds = [
    ...new Set(
      (invoices as Record<string, unknown>[])
        .map((inv) => String(inv.company_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const nameMap = await loadCompanyNameMap(admin, tenantCompanyId, companyIds);

  for (const inv of invoices as Record<string, unknown>[]) {
    const invoiceId = String(inv.id ?? "").trim();
    const companyId = String(inv.company_id ?? "").trim();
    const dueDate = String(inv.due_date ?? "").trim();
    if (!invoiceId || !companyId || !dueDate || dueDate >= today) continue;

    const balance = Number(inv.balance_amount ?? 0);
    if (balance <= 0) continue;

    const currency = String(inv.currency_code ?? "UYU").toUpperCase();
    const daysOverdue = Math.max(0, daysBetween(dueDate, today));
    const r = await notifyInvoiceOverdue({
      tenantCompanyId,
      invoiceId,
      clientId: companyId,
      clientName: nameMap.get(companyId) ?? "Cliente",
      amount: balance,
      currency,
      dueDate,
      daysOverdue,
    });
    tally(acc, "client_overdue", r);
  }
}

async function loadDebtLifecycleState(
  admin: AdminClient,
  tenantCompanyId: string
) {
  const { data, error } = await admin
    .from("copilot_notifications")
    .select("type, dedup_key, created_at, metadata")
    .eq("workspace_company_id", tenantCompanyId)
    .in("type", ["new_debtor", "client_debt_settled"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) return new Map();
  return buildDebtLifecycleStateMap(
    data as Array<{
      type: string;
      dedup_key: string | null;
      created_at: string;
      metadata?: Record<string, unknown> | null;
    }>
  );
}

async function generateNewDebtorNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const today = todayYmd(now);
  const sinceLookback = new Date(
    now.getTime() - NEW_DEBT_LOOKBACK_HOURS * 3_600_000
  ).toISOString();

  const [invoicesRes, lifecycleMap] = await Promise.all([
    admin
      .from("proto_invoices")
      .select("id, company_id, balance_amount, currency_code, status, created_at, updated_at")
      .eq("workspace_company_id", tenantCompanyId)
      .in("status", ["pending", "overdue", "partial"])
      .limit(OPEN_INVOICE_LIMIT),
    loadDebtLifecycleState(admin, tenantCompanyId),
  ]);

  if (invoicesRes.error || !invoicesRes.data) return;
  const invoices = invoicesRes.data as Record<string, unknown>[];

  type DebtAgg = {
    totalBalance: number;
    hasRecentInvoiceActivity: boolean;
    sampleInvoiceId: string | null;
  };
  const debtByClientCurrency = new Map<string, DebtAgg>();

  for (const inv of invoices) {
    const companyId = String(inv.company_id ?? "").trim();
    const balance = Number(inv.balance_amount ?? 0);
    if (!companyId || balance <= 0) continue;

    const currency = String(inv.currency_code ?? "UYU").toUpperCase();
    const key = `${companyId}:${currency}`;
    const createdAt = String(inv.created_at ?? "");
    const recent = Boolean(createdAt && createdAt >= sinceLookback);

    if (!debtByClientCurrency.has(key)) {
      debtByClientCurrency.set(key, {
        totalBalance: 0,
        hasRecentInvoiceActivity: false,
        sampleInvoiceId: null,
      });
    }
    const agg = debtByClientCurrency.get(key)!;
    agg.totalBalance += balance;
    if (recent) agg.hasRecentInvoiceActivity = true;
    if (!agg.sampleInvoiceId) agg.sampleInvoiceId = String(inv.id ?? "").trim() || null;
  }

  const companyIds = [...new Set([...debtByClientCurrency.keys()].map((k) => k.split(":")[0]!))];
  const nameMap = await loadCompanyNameMap(admin, tenantCompanyId, companyIds);

  for (const [key, agg] of debtByClientCurrency.entries()) {
    const [clientId, currency] = key.split(":");
    if (!clientId || !currency) continue;

    const lifecycle = resolveDebtLifecycleForClientCurrency(lifecycleMap, clientId, currency);
    if (
      !shouldNotifyNewDebtor({
        totalBalance: agg.totalBalance,
        hasRecentInvoiceActivity: agg.hasRecentInvoiceActivity,
        lifecycle,
      })
    ) {
      continue;
    }

    const r = await notifyNewDebtor({
      tenantCompanyId,
      clientId,
      clientName: nameMap.get(clientId) ?? "Cliente",
      amount: agg.totalBalance,
      currency,
      dateBucket: today,
      invoiceId: agg.sampleInvoiceId,
    });
    tally(acc, "new_debtor", r);
  }
}

async function generateRecentCollectionNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const since72h = new Date(now.getTime() - COLLECTION_RECEIVED_LOOKBACK_HOURS * 3_600_000).toISOString();

  // Fetch treasury baselines and receipts in parallel — baseline is needed to
  // annotate each notification with cash-impact context (pre vs post baseline).
  const [receiptsRes, balancesRes] = await Promise.all([
    admin
      .from("proto_receipts")
      .select("id, company_id, amount, currency_code, receipt_date")
      .eq("workspace_company_id", tenantCompanyId)
      .gte("created_at", since72h)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("treasury_cash_opening_balances")
      .select("currency_code, effective_date")
      .eq("workspace_id", tenantCompanyId),
  ]);

  if (receiptsRes.error || !receiptsRes.data) return;
  const receipts = receiptsRes.data;

  // Build baseline map: currency → YYYY-MM-DD (null if not configured)
  const baselineByCurrency: Partial<Record<string, string>> = {};
  for (const b of (balancesRes.data ?? []) as Record<string, unknown>[]) {
    const code = String(b.currency_code ?? "").trim().toUpperCase();
    const date = String(b.effective_date ?? "").slice(0, 10);
    if (code && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      baselineByCurrency[code] = date;
    }
  }

  const companyIds = [
    ...new Set(
      (receipts as Record<string, unknown>[])
        .map((r) => String(r.company_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const nameMap = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await admin
      .from("proto_companies")
      .select("id, name")
      .eq("workspace_company_id", tenantCompanyId)
      .in("id", companyIds.slice(0, 200));
    for (const c of (companies ?? []) as Record<string, unknown>[]) {
      nameMap.set(String(c.id), String(c.name ?? "Cliente"));
    }
  }

  const today = todayYmd(now);

  for (const rec of receipts as Record<string, unknown>[]) {
    const receiptId = String(rec.id ?? "").trim();
    if (!receiptId) continue;
    const amount = Number(rec.amount ?? 0);
    if (amount <= 0) continue;
    const companyId = String(rec.company_id ?? "").trim();
    const currency = String(rec.currency_code ?? "UYU").toUpperCase();
    const rawDate = String(rec.receipt_date ?? "").slice(0, 10);
    const receiptDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    const clientName = nameMap.get(companyId) ?? "Cliente";

    const remainingTotalBalance = companyId
      ? await loadClientOpenInvoiceBalances(admin, tenantCompanyId, companyId)
      : 0;
    const outcome = resolveCollectionPaymentOutcome(remainingTotalBalance);

    if (outcome === "settled" && companyId) {
      const settled = await notifyClientDebtSettled({
        tenantCompanyId,
        clientId: companyId,
        clientName,
        currency,
        receiptId,
        dateBucket: today,
      });
      tally(acc, "client_debt_settled", settled);
      continue;
    }

    const r = await notifyCollectionReceived({
      tenantCompanyId,
      receiptId,
      clientName,
      amount,
      currency,
      clientId: companyId || null,
      remainingBalance: outcome === "partial" ? remainingTotalBalance : null,
      receiptDate,
      treasuryBaselineDate: baselineByCurrency[currency] ?? null,
    });
    tally(acc, "collection_received", r);
  }
}

// ─── Debt followup summary ────────────────────────────────────────────────────

/**
 * Genera UNA notificación diaria que resume clientes con deuda vencida.
 * Reemplaza el spam de notificaciones individuales cuando hay muchos deudores.
 * Dedup diario: solo se crea una por workspace por día.
 */
async function generateDebtFollowupSummaryNotification(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const today = todayYmd(now);

  const { data: invoices, error } = await admin
    .from("proto_invoices")
    .select("company_id, balance_amount, currency_code, due_date, status")
    .eq("workspace_company_id", tenantCompanyId)
    .in("status", ["pending", "overdue", "partial"])
    .limit(2000);

  if (error || !invoices) return;

  const overdueClients = new Set<string>();
  let uyuOverdue = 0;
  let usdOverdue = 0;

  for (const inv of invoices as Record<string, unknown>[]) {
    const dueDate = String(inv.due_date ?? "").trim();
    if (!dueDate || dueDate >= today) continue;
    const balance = Number(inv.balance_amount ?? 0);
    if (balance <= 0) continue;
    const companyId = String(inv.company_id ?? "").trim();
    if (!companyId) continue;
    const currency = String(inv.currency_code ?? "UYU").toUpperCase();
    overdueClients.add(companyId);
    if (currency === "USD") usdOverdue += balance;
    else uyuOverdue += balance;
  }

  if (overdueClients.size === 0) return;

  const r = await notifyDebtFollowupSummary({
    tenantCompanyId,
    overdueClientCount: overdueClients.size,
    uyuOverdue,
    usdOverdue,
    asOfYmd: today,
  });
  tally(acc, "debt_followup_summary", r);
}

// ─── Not yet implemented generators ──────────────────────────────────────────
// TODO: notifySyncChangesDetected — requires the sync job to emit a structured
//   summary (added/updated/removed counts) and pass it to this generator.
//
// TODO: cash_risk_detected — requiere modelo de umbral de caja y eventos de
//   movimiento en tiempo real; fuera de alcance de este ticket.

// ─── Public entry point ───────────────────────────────────────────────────────

export async function generateOperationalNotificationsForWorkspace({
  workspaceCompanyId,
  now = new Date(),
}: {
  workspaceCompanyId: string;
  now?: Date;
}): Promise<GenerateResult> {
  const acc: GenerateResult = { ok: true, created: 0, skipped: 0, byType: {} };

  const admin = getAdminClient();
  if (!admin) {
    console.warn("[generate-notifications] no service role client — missing env vars");
    return { ...acc, ok: false };
  }

  // Load inactive recurring template IDs once — shared by both treasury generators.
  // This mirrors the loadInactiveRecurringTemplateIds() call in Hoy/Tesorería routes.
  const inactiveTemplateIds = await loadInactiveTemplateIds(admin, workspaceCompanyId);

  await Promise.allSettled([
    generateTreasuryDueNotifications(admin, workspaceCompanyId, now, inactiveTemplateIds, acc),
    generateTreasuryOverdueNotifications(admin, workspaceCompanyId, now, inactiveTemplateIds, acc),
    generateInvoiceOverdueNotifications(admin, workspaceCompanyId, now, acc),
    generateNewDebtorNotifications(admin, workspaceCompanyId, now, acc),
    generateRecentCollectionNotifications(admin, workspaceCompanyId, now, acc),
    generateDebtFollowupSummaryNotification(admin, workspaceCompanyId, now, acc),
  ]);

  return acc;
}
