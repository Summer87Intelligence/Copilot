import { createClient } from "@supabase/supabase-js";

import {
  notifyClientDebtSettled,
  notifyClientOverdue,
  notifyCollectionReceived,
  notifyDebtFollowupSummary,
  notifyNewDebtor,
  notifyTreasuryPaymentDue,
  notifyTreasuryPaymentOverdue,
  notifyCashRiskDetected,
  type CashRiskCurrencyDetail,
  type DebtFollowupTopClient,
} from "./notification-events";
import { DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD } from "@/lib/currency-display-mode";
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
      "id, title, amount_estimated, amount_final, currency_code, due_date, status, " +
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
    const metaDueTime = (ob.metadata as Record<string, unknown> | null | undefined)?.due_time;
    const dueTime = metaDueTime ? String(metaDueTime).trim() || null : null;
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

  // Aggregate by (clientId, currency) to emit one alert per client+moneda
  // instead of one per invoice — avoids N-notification spam for clients with
  // multiple overdue invoices. daysOverdue tracks the worst (oldest) invoice.
  type ClientCurrencyAgg = {
    totalBalance: number;
    maxDaysOverdue: number;
    invoiceCount: number;
  };
  const byClientCurrency = new Map<string, ClientCurrencyAgg>();

  for (const inv of invoices as Record<string, unknown>[]) {
    const companyId = String(inv.company_id ?? "").trim();
    const dueDate = String(inv.due_date ?? "").trim();
    if (!companyId || !dueDate || dueDate >= today) continue;

    const balance = Number(inv.balance_amount ?? 0);
    if (balance <= 0) continue;

    const currency = String(inv.currency_code ?? "UYU").toUpperCase();
    const daysOverdue = Math.max(0, daysBetween(dueDate, today));
    const key = `${companyId}:${currency}`;
    const existing = byClientCurrency.get(key);
    if (existing) {
      existing.totalBalance += balance;
      existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, daysOverdue);
      existing.invoiceCount += 1;
    } else {
      byClientCurrency.set(key, { totalBalance: balance, maxDaysOverdue: daysOverdue, invoiceCount: 1 });
    }
  }

  if (byClientCurrency.size === 0) return;

  const companyIds = [
    ...new Set([...byClientCurrency.keys()].map((k) => k.split(":")[0]!)),
  ];
  const nameMap = await loadCompanyNameMap(admin, tenantCompanyId, companyIds);

  for (const [key, agg] of byClientCurrency) {
    const colonIdx = key.indexOf(":");
    const companyId = key.slice(0, colonIdx);
    const currency = key.slice(colonIdx + 1);
    if (!companyId || !currency) continue;

    const r = await notifyClientOverdue({
      tenantCompanyId,
      clientId: companyId,
      clientName: nameMap.get(companyId) ?? "Cliente",
      amount: agg.totalBalance,
      currency,
      daysOverdue: agg.maxDaysOverdue,
      invoiceCount: agg.invoiceCount,
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
        amount,
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

  type ClientAgg = { uyuAmount: number; usdAmount: number };
  const byClient = new Map<string, ClientAgg>();
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

    if (!byClient.has(companyId)) byClient.set(companyId, { uyuAmount: 0, usdAmount: 0 });
    const agg = byClient.get(companyId)!;
    if (currency === "USD") {
      agg.usdAmount += balance;
      usdOverdue += balance;
    } else {
      agg.uyuAmount += balance;
      uyuOverdue += balance;
    }
  }

  if (byClient.size === 0) return;

  // Sort by USD-equivalent descending to get the top 3 highest debtors
  const sorted = [...byClient.entries()]
    .map(([id, agg]) => ({
      id,
      agg,
      score: agg.usdAmount + agg.uyuAmount / DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD,
    }))
    .sort((a, b) => b.score - a.score);

  const top3Ids = sorted.slice(0, 3).map((c) => c.id);
  const nameMap = await loadCompanyNameMap(admin, tenantCompanyId, top3Ids);

  const topClients: DebtFollowupTopClient[] = sorted.slice(0, 3).map(({ id, agg }) => ({
    name: nameMap.get(id) ?? "Cliente",
    amountUYU: Math.round(agg.uyuAmount),
    amountUSD: Math.round(agg.usdAmount * 100) / 100,
  }));

  // Pre-compute title amount for executive scan:
  // single currency → show that currency; mixed → show USD equivalent
  const titleDisplay = (() => {
    const fmt = (n: number, cur: string) =>
      `${cur} ${Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
    if (usdOverdue > 0 && uyuOverdue === 0) return fmt(usdOverdue, "USD");
    if (uyuOverdue > 0 && usdOverdue === 0) return fmt(uyuOverdue, "UYU");
    const totalUsd = usdOverdue + uyuOverdue / DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;
    return `${fmt(totalUsd, "USD")} equiv.`;
  })();

  const r = await notifyDebtFollowupSummary({
    tenantCompanyId,
    overdueClientCount: byClient.size,
    uyuOverdue,
    usdOverdue,
    topClients,
    titleDisplay,
    asOfYmd: today,
  });
  tally(acc, "debt_followup_summary", r);
}

// ─── Cash risk ───────────────────────────────────────────────────────────────

/**
 * Marks unread cash_risk_detected notifications as read when consolidated USD
 * coverage is now positive (UYU converted at system rate). Adds an audit note
 * to metadata so the resolution is traceable.
 * Returns the count of notifications resolved.
 */
async function resolveStaleConsolidatedCashRiskNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  consolidatedDeficit: number
): Promise<number> {
  if (consolidatedDeficit < 0) return 0; // still in deficit — keep alerts

  const { data } = await admin
    .from("copilot_notifications")
    .select("id, metadata")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("type", "cash_risk_detected")
    .is("read_at", null);

  if (!data?.length) return 0;

  const now = new Date().toISOString();
  let resolved = 0;
  for (const row of data as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
    const existingMeta = row.metadata ?? {};
    const { error } = await admin
      .from("copilot_notifications")
      .update({
        read_at: now,
        metadata: {
          ...existingMeta,
          auto_resolved_reason: "Resolved after consolidated USD coverage recalculation.",
          resolved_at: now,
        },
      })
      .eq("id", row.id)
      .eq("workspace_company_id", tenantCompanyId)
      .is("read_at", null);
    if (!error) resolved++;
  }
  return resolved;
}

/**
 * Fires cash_risk_detected when projected consolidated cash (all currencies
 * converted to USD at the system rate) is negative for the 30d horizon.
 * Also resolves any stale cash_risk_detected notifications when coverage turns positive.
 * Deduped per day — fires at most once per day.
 */
async function generateCashRiskNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  inactiveTemplateIds: ReadonlySet<string>,
  acc: GenerateResult
) {
  const today = todayYmd(now);
  const horizon = futureDateYmd(now, 30);

  // Opening balances — one row per currency
  const { data: balancesData } = await admin
    .from("treasury_cash_opening_balances")
    .select("currency_code, amount, effective_date")
    .eq("workspace_id", tenantCompanyId);

  const openingByCurrency: Record<string, { amount: number; effectiveDate: string }> = {};
  for (const b of (balancesData ?? []) as Record<string, unknown>[]) {
    const cur = String(b.currency_code ?? "").trim().toUpperCase();
    const date = String(b.effective_date ?? "").slice(0, 10);
    if (cur) {
      openingByCurrency[cur] = { amount: Number(b.amount ?? 0), effectiveDate: date };
    }
  }

  // Manual cash movements after each baseline date
  const { data: movementsData } = await admin
    .from("manual_cash_movements")
    .select("currency_code, movement_type, amount, movement_date, status, metadata")
    .eq("workspace_id", tenantCompanyId)
    .eq("status", "active")
    .limit(500);

  const netManualByCurrency: Record<string, number> = {};
  for (const m of (movementsData ?? []) as Record<string, unknown>[]) {
    const cur = String(m.currency_code ?? "").trim().toUpperCase();
    if (!cur) continue;
    const meta = m.metadata as Record<string, unknown> | null | undefined;
    if (meta?.kind === "opening_balance") continue; // skip proxy rows
    const baseline = openingByCurrency[cur]?.effectiveDate ?? "";
    const movDate = String(m.movement_date ?? "").slice(0, 10);
    if (baseline && movDate < baseline) continue;
    const amt = Number(m.amount ?? 0);
    const type = String(m.movement_type ?? "");
    if (type === "income") {
      netManualByCurrency[cur] = (netManualByCurrency[cur] ?? 0) + amt;
    } else if (type === "expense") {
      netManualByCurrency[cur] = (netManualByCurrency[cur] ?? 0) - amt;
    }
  }

  // Upcoming 30d outflows
  const { data: obligationsData } = await admin
    .from("planned_cash_obligations")
    .select(
      "currency_code, amount_estimated, amount_final, direction, affects_cashflow, " +
      "due_date, status, recurring_template_id, recurring_instance_key, metadata"
    )
    .eq("workspace_id", tenantCompanyId)
    .in("status", ["planned", "confirmed", "overdue"])
    .lte("due_date", horizon)
    .limit(200);

  const committedByCurrency: Record<string, number> = {};
  for (const ob of (obligationsData ?? []) as unknown as Record<string, unknown>[]) {
    if (ob.direction !== "outflow" || ob.affects_cashflow === false) continue;
    if (!isObligationEligible(ob, inactiveTemplateIds)) continue;
    const cur = String(ob.currency_code ?? "").trim().toUpperCase();
    if (!cur) continue;
    const amt = Number(ob.amount_final ?? ob.amount_estimated ?? 0);
    committedByCurrency[cur] = (committedByCurrency[cur] ?? 0) + amt;
  }

  // Evaluate consolidated USD deficit — UYU is converted at the system rate so
  // pesos already in the vault count toward USD coverage. Avoids spurious alerts
  // when the company has enough UYU to cover all outflows once consolidated.
  const rate = DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;
  const uyuAvailable = (openingByCurrency["UYU"]?.amount ?? 0) + (netManualByCurrency["UYU"] ?? 0);
  const usdAvailable = (openingByCurrency["USD"]?.amount ?? 0) + (netManualByCurrency["USD"] ?? 0);
  const uyuCommitted = committedByCurrency["UYU"] ?? 0;
  const usdCommitted = committedByCurrency["USD"] ?? 0;

  const totalAvailableUsd = usdAvailable + uyuAvailable / rate;
  const totalCommittedUsd = usdCommitted + uyuCommitted / rate;
  const consolidatedDeficit = Math.round((totalAvailableUsd - totalCommittedUsd) * 100) / 100;

  // Resolve any stale alerts before deciding whether to create a new one.
  // Runs even when coverage is positive so outdated notifications get cleaned up.
  await resolveStaleConsolidatedCashRiskNotifications(admin, tenantCompanyId, consolidatedDeficit);

  const affectedCurrencies: CashRiskCurrencyDetail[] = [];
  if (consolidatedDeficit < 0) {
    affectedCurrencies.push({
      currency: "USD",
      availableCash: Math.round(totalAvailableUsd * 100) / 100,
      committedOutflows: Math.round(totalCommittedUsd * 100) / 100,
      deficit: consolidatedDeficit,
    });
  }

  if (affectedCurrencies.length === 0) return;

  const r = await notifyCashRiskDetected({
    tenantCompanyId,
    asOfYmd: today,
    affectedCurrencies,
  });
  tally(acc, "cash_risk_detected", r);
}

// ─── Not yet implemented generators ──────────────────────────────────────────
// TODO: notifySyncChangesDetected — requires the sync job to emit a structured
//   summary (added/updated/removed counts) and pass it to this generator.

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
    generateCashRiskNotifications(admin, workspaceCompanyId, now, inactiveTemplateIds, acc),
    generateInvoiceOverdueNotifications(admin, workspaceCompanyId, now, acc),
    generateNewDebtorNotifications(admin, workspaceCompanyId, now, acc),
    generateRecentCollectionNotifications(admin, workspaceCompanyId, now, acc),
    generateDebtFollowupSummaryNotification(admin, workspaceCompanyId, now, acc),
  ]);

  return acc;
}
