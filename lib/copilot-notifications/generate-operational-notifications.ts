import { createClient } from "@supabase/supabase-js";

import {
  notifyClientOverdue,
  notifyCollectionReceived,
  notifyDebtFollowupSummary,
  notifyTreasuryPaymentDue,
  notifyTreasuryPaymentOverdue,
} from "./notification-events";
import { businessDateYmd } from "./business-date";

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

async function generateClientOverdueNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const today = todayYmd(now);

  const { data: companies, error: cErr } = await admin
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .limit(500);

  if (cErr || !companies?.length) return;

  const OVERDUE_INVOICE_LIMIT = 2000;
  const { data: invoices, error: iErr } = await admin
    .from("proto_invoices")
    .select("company_id, balance_amount, due_date, currency_code, status")
    .eq("workspace_company_id", tenantCompanyId)
    .in("status", ["pending", "overdue", "partial"])
    .limit(OVERDUE_INVOICE_LIMIT);

  if (iErr || !invoices) return;

  if (invoices.length >= OVERDUE_INVOICE_LIMIT) {
    console.warn(
      `[generate-notifications] generateClientOverdueNotifications hit invoice limit (${OVERDUE_INVOICE_LIMIT}) for workspace ${tenantCompanyId} — aggregation may be incomplete`
    );
  }

  // Track both aggregated balance and the maximum daysOverdue per company+currency.
  type OverdueAgg = {
    uyu: number; usd: number; other: number;
    maxDaysUyu: number; maxDaysUsd: number; maxDaysOther: number;
  };
  const overdueByCompany = new Map<string, OverdueAgg>();

  for (const inv of invoices as Record<string, unknown>[]) {
    const companyId = String(inv.company_id ?? "").trim();
    const dueDate = String(inv.due_date ?? "").trim();
    if (!companyId || !dueDate || dueDate >= today) continue;
    const balance = Number(inv.balance_amount ?? 0);
    if (balance <= 0) continue;
    const currency = String(inv.currency_code ?? "UYU").toUpperCase();
    const days = Math.max(0, daysBetween(dueDate, today));

    if (!overdueByCompany.has(companyId)) {
      overdueByCompany.set(companyId, {
        uyu: 0, usd: 0, other: 0,
        maxDaysUyu: 0, maxDaysUsd: 0, maxDaysOther: 0,
      });
    }
    const agg = overdueByCompany.get(companyId)!;
    if (currency === "USD") {
      agg.usd += balance;
      if (days > agg.maxDaysUsd) agg.maxDaysUsd = days;
    } else if (currency === "UYU") {
      agg.uyu += balance;
      if (days > agg.maxDaysUyu) agg.maxDaysUyu = days;
    } else {
      agg.other += balance;
      if (days > agg.maxDaysOther) agg.maxDaysOther = days;
    }
  }

  const nameMap = new Map<string, string>();
  for (const c of companies as Record<string, unknown>[]) {
    nameMap.set(String(c.id), String(c.name ?? "Cliente"));
  }

  for (const [companyId, agg] of overdueByCompany.entries()) {
    const name = nameMap.get(companyId) ?? "Cliente";

    if (agg.uyu > 0) {
      tally(acc, "client_overdue", await notifyClientOverdue({
        tenantCompanyId, clientId: companyId, clientName: name,
        amount: agg.uyu, currency: "UYU", daysOverdue: agg.maxDaysUyu,
      }));
    }
    if (agg.usd > 0) {
      tally(acc, "client_overdue", await notifyClientOverdue({
        tenantCompanyId, clientId: companyId, clientName: name,
        amount: agg.usd, currency: "USD", daysOverdue: agg.maxDaysUsd,
      }));
    }
    if (agg.other > 0 && agg.uyu === 0 && agg.usd === 0) {
      tally(acc, "client_overdue", await notifyClientOverdue({
        tenantCompanyId, clientId: companyId, clientName: name,
        amount: agg.other, currency: "UYU", daysOverdue: agg.maxDaysOther,
      }));
    }
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

  for (const rec of receipts as Record<string, unknown>[]) {
    const receiptId = String(rec.id ?? "").trim();
    if (!receiptId) continue;
    const amount = Number(rec.amount ?? 0);
    if (amount <= 0) continue;
    const companyId = String(rec.company_id ?? "").trim();
    const currency = String(rec.currency_code ?? "UYU").toUpperCase();
    const rawDate = String(rec.receipt_date ?? "").slice(0, 10);
    const receiptDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    const r = await notifyCollectionReceived({
      tenantCompanyId,
      receiptId,
      clientName: nameMap.get(companyId) ?? "Cliente",
      amount,
      currency,
      clientId: companyId || null,
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
// TODO: notifyNewDebtor — requires a reliable historical snapshot to detect
//   when a company transitions from "no overdue" to "has overdue" for the first
//   time in a period. Cannot be derived safely from a single-pass query.
//
// TODO: notifySyncChangesDetected — requires the sync job to emit a structured
//   summary (added/updated/removed counts) and pass it to this generator.
//   Until the sync job exposes that data, this type is intentionally unused.

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
    generateClientOverdueNotifications(admin, workspaceCompanyId, now, acc),
    generateRecentCollectionNotifications(admin, workspaceCompanyId, now, acc),
    generateDebtFollowupSummaryNotification(admin, workspaceCompanyId, now, acc),
  ]);

  return acc;
}
