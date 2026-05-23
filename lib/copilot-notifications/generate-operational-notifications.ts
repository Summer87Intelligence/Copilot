import { createClient } from "@supabase/supabase-js";

import {
  notifyClientOverdue,
  notifyCollectionReceived,
  notifyTreasuryPaymentDue,
  notifyTreasuryPaymentOverdue,
} from "./notification-events";

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
  return now.toISOString().slice(0, 10);

}

function futureDateYmd(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
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

async function generateTreasuryDueNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const today = todayYmd(now);
  const limit = futureDateYmd(now, 7);

  const { data, error } = await admin
    .from("planned_cash_obligations")
    .select("id, title, amount_estimated, amount_final, currency_code, due_date, status")
    .eq("workspace_id", tenantCompanyId)
    .in("status", ["planned", "confirmed"])
    .gte("due_date", today)
    .lte("due_date", limit)
    .order("due_date", { ascending: true })
    .limit(100);

  if (error || !data) return;

  for (const ob of data as Record<string, unknown>[]) {
    const dueDate = String(ob.due_date ?? "").trim();
    if (!dueDate) continue;
    const daysUntilDue = daysBetween(today, dueDate);
    const r = await notifyTreasuryPaymentDue({
      tenantCompanyId,
      obligationId: String(ob.id),
      title: String(ob.title ?? "Pago"),
      amount: Number(ob.amount_final ?? ob.amount_estimated ?? 0),
      currency: String(ob.currency_code ?? "UYU").toUpperCase(),
      dueDate,
      daysUntilDue,
    });
    tally(acc, "treasury_payment_due", r);
  }
}

async function generateTreasuryOverdueNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const today = todayYmd(now);

  const { data, error } = await admin
    .from("planned_cash_obligations")
    .select("id, title, amount_estimated, amount_final, currency_code, due_date, status")
    .eq("workspace_id", tenantCompanyId)
    .in("status", ["planned", "confirmed", "overdue"])
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(100);

  if (error || !data) return;

  for (const ob of data as Record<string, unknown>[]) {
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

async function generateClientOverdueNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  acc: GenerateResult
) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: companies, error: cErr } = await admin
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .limit(500);

  if (cErr || !companies?.length) return;

  const { data: invoices, error: iErr } = await admin
    .from("proto_invoices")
    .select("company_id, balance_amount, due_date, currency_code, status")
    .eq("workspace_company_id", tenantCompanyId)
    .in("status", ["pending", "overdue", "partial"])
    .limit(2000);

  if (iErr || !invoices) return;

  type OverdueAgg = { uyu: number; usd: number; other: number };
  const overdueByCompany = new Map<string, OverdueAgg>();

  for (const inv of invoices as Record<string, unknown>[]) {
    const companyId = String(inv.company_id ?? "").trim();
    const dueDate = String(inv.due_date ?? "").trim();
    if (!companyId || !dueDate || dueDate >= today) continue;

    const balance = Number(inv.balance_amount ?? 0);
    if (balance <= 0) continue;

    const currency = String(inv.currency_code ?? "UYU").toUpperCase();
    if (!overdueByCompany.has(companyId)) {
      overdueByCompany.set(companyId, { uyu: 0, usd: 0, other: 0 });
    }
    const agg = overdueByCompany.get(companyId)!;
    if (currency === "USD") agg.usd += balance;
    else if (currency === "UYU") agg.uyu += balance;
    else agg.other += balance;
  }

  const nameMap = new Map<string, string>();
  for (const c of companies as Record<string, unknown>[]) {
    nameMap.set(String(c.id), String(c.name ?? "Cliente"));
  }

  for (const [companyId, agg] of overdueByCompany.entries()) {
    const name = nameMap.get(companyId) ?? "Cliente";

    if (agg.uyu > 0) {
      const r = await notifyClientOverdue({
        tenantCompanyId,
        clientId: companyId,
        clientName: name,
        amount: agg.uyu,
        currency: "UYU",
        daysOverdue: 30,
      });
      tally(acc, "client_overdue", r);
    }

    if (agg.usd > 0) {
      const r = await notifyClientOverdue({
        tenantCompanyId,
        clientId: companyId,
        clientName: name,
        amount: agg.usd,
        currency: "USD",
        daysOverdue: 30,
      });
      tally(acc, "client_overdue", r);
    }

    if (agg.other > 0 && agg.uyu === 0 && agg.usd === 0) {
      const r = await notifyClientOverdue({
        tenantCompanyId,
        clientId: companyId,
        clientName: name,
        amount: agg.other,
        currency: "UYU",
        daysOverdue: 30,
      });
      tally(acc, "client_overdue", r);
    }
  }
}

async function generateRecentCollectionNotifications(
  admin: AdminClient,
  tenantCompanyId: string,
  now: Date,
  acc: GenerateResult
) {
  const since72h = new Date(now.getTime() - 72 * 3_600_000).toISOString();

  const { data: receipts, error } = await admin
    .from("proto_receipts")
    .select("id, company_id, amount, currency_code, receipt_date")
    .eq("workspace_company_id", tenantCompanyId)
    .gte("created_at", since72h)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !receipts) return;

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
    const clientName = nameMap.get(companyId) ?? "Cliente";
    const currency = String(rec.currency_code ?? "UYU").toUpperCase();

    const r = await notifyCollectionReceived({
      tenantCompanyId,
      receiptId,
      clientName,
      amount,
      currency,
      clientId: companyId || null,
    });
    tally(acc, "collection_received", r);
  }
}

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

  await Promise.allSettled([
    generateTreasuryDueNotifications(admin, workspaceCompanyId, now, acc),
    generateTreasuryOverdueNotifications(admin, workspaceCompanyId, now, acc),
    generateClientOverdueNotifications(admin, workspaceCompanyId, acc),
    generateRecentCollectionNotifications(admin, workspaceCompanyId, now, acc),
  ]);

  return acc;
}
