import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OicConflictiveInvoice,
  OicReconciliationSummary,
  OicSeverity,
} from "@/lib/operacional/types";

const BALANCE_EPS = 0.005;

function gapSeverity(gap: number, missingCount: number): OicSeverity {
  if (missingCount >= 7 || Math.abs(gap) > 1000) return "critical";
  if (missingCount >= 3 || Math.abs(gap) > 100) return "warning";
  return "ok";
}

export async function computeOicReconciliationSummary(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicReconciliationSummary> {
  const computedAt = new Date().toISOString();

  // Facturas activas con balance > 0 + campos de metadata para gap detection
  const { data: invoices, error: invErr } = await supabase
    .from("proto_invoices")
    .select(
      "id, invoice_number, balance_amount, currency_code, zeta_metadata, status"
    )
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("is_active", true)
    .gt("balance_amount", BALANCE_EPS)
    .in("status", ["open", "partial"])
    .limit(500);

  if (invErr) throw invErr;

  // Completeness audits recientes para detectar drifts
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: audits } = await supabase
    .from("zeta_completeness_audits")
    .select(
      "workspace_company_id, entity, audit_scope, zeta_count, local_count, severity, audited_at"
    )
    .eq("workspace_company_id", workspaceCompanyId)
    .gte("audited_at", thirtyDaysAgo)
    .order("audited_at", { ascending: false })
    .limit(100);

  const recentCritical = (audits ?? []).filter(
    (a) => a.severity === "critical"
  ).length;
  const recentWarning = (audits ?? []).filter(
    (a) => a.severity === "warning"
  ).length;

  // Build conflictive invoices from audits vs local
  // For simplicity: invoices that have missing_count signal in zeta_metadata
  const conflictiveInvoices: OicConflictiveInvoice[] = [];
  let totalMatchedCount = 0;
  let gapUsd = 0;
  let gapUyu = 0;
  let criticalCount = 0;

  const allInvoices = invoices ?? [];
  const totalInvoices = allInvoices.length;

  for (const inv of allInvoices) {
    const meta = inv.zeta_metadata as Record<string, unknown> | null;
    const missingCount =
      (meta?.missing_saldo_count as number | undefined) ?? 0;
    const balanceDb = (inv.balance_amount as number) ?? 0;

    if (missingCount === 0) {
      totalMatchedCount++;
      continue;
    }

    const currency = (inv.currency_code as string | null) ?? "UYU";
    const v1 = meta?.zeta_customer_voucher_v1 as
      | Record<string, unknown>
      | undefined;
    const clienteName =
      (meta?.client_name as string | null) ??
      (v1?.raw_payload as Record<string, unknown> | undefined)
        ?.RazonSocial as string | null ??
      "—";
    const registroId =
      (
        meta?.zeta_comprobante_identity_v1 as
          | Record<string, unknown>
          | undefined
      )?.registro_id as string | null ?? null;

    const sev = gapSeverity(balanceDb, missingCount);
    if (sev === "critical") criticalCount++;

    if (currency === "USD") gapUsd += balanceDb;
    else gapUyu += balanceDb;

    conflictiveInvoices.push({
      invoiceId: inv.id as string,
      invoiceNumber: inv.invoice_number as string,
      clienteName: typeof clienteName === "string" ? clienteName : "—",
      currencyCode: currency,
      balanceDb,
      balanceZeta: null, // No live Zeta pull in observability layer
      gapAmount: balanceDb,
      severity: sev,
      missingCount,
      lastSyncAt: null,
      registroId,
    });
  }

  const conflictCount = conflictiveInvoices.length;
  // Matched = total that were NOT conflictive (missingCount=0)
  const matchedCount = totalMatchedCount;

  // Boost criticalCount from completeness audits
  if (recentCritical > 0 && criticalCount === 0) criticalCount = recentCritical;

  return {
    workspaceCompanyId,
    computedAt,
    totalInvoices,
    matchedCount,
    conflictCount,
    criticalCount,
    gapUsd: Math.round(gapUsd * 100) / 100,
    gapUyu: Math.round(gapUyu * 100) / 100,
    conflictiveInvoices: conflictiveInvoices.slice(0, 50),
  };
}
