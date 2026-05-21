import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OicConflictiveInvoice,
  OicReconciliationSummary,
  OicSeverity,
} from "@/lib/operacional/types";

const BALANCE_EPS = 0.005;

function invoiceSeverity(gap: number, missingCount: number): OicSeverity {
  if (missingCount >= 7 || Math.abs(gap) > 1000) return "critical";
  if (missingCount >= 3 || Math.abs(gap) > 100) return "warning";
  return "ok"; // missingCount 1–2, gap pequeño: informativo
}

function suggestedAction(sev: OicSeverity): string {
  switch (sev) {
    case "critical": return "Resync urgente — verificar en Zeta";
    case "warning":  return "Revisar en próximo ciclo de sync";
    default:         return "Monitorear";
  }
}

// Deriva el status global SOLO de los conflictos actuales de facturas.
// Las auditorías históricas NO afectan este campo.
function deriveStatus(criticalCount: number, warningCount: number, conflictCount: number): OicSeverity {
  if (conflictCount === 0) return "ok";
  if (criticalCount > 0)   return "critical";
  if (warningCount > 0)    return "warning";
  return "ok"; // solo infoCount > 0
}

export async function computeOicReconciliationSummary(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicReconciliationSummary> {
  const computedAt = new Date().toISOString();

  // Facturas abiertas con saldo positivo
  const { data: invoices, error: invErr } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, currency_code, zeta_metadata, status")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("is_active", true)
    .gt("balance_amount", BALANCE_EPS)
    .in("status", ["open", "partial"])
    .limit(500);

  if (invErr) throw invErr;

  // Auditorías de completitud recientes — fuente histórica, separada del estado actual
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: audits } = await supabase
    .from("zeta_completeness_audits")
    .select("severity, audited_at")
    .eq("workspace_company_id", workspaceCompanyId)
    .gte("audited_at", thirtyDaysAgo)
    .order("audited_at", { ascending: false })
    .limit(100);

  const auditRows = audits ?? [];
  const historicalAuditCritical = auditRows.filter((a) => a.severity === "critical").length;
  const historicalAuditWarning  = auditRows.filter((a) => a.severity === "warning").length;
  const lastAuditAt = auditRows[0]?.audited_at ?? null;

  // Clasificar cada factura
  const conflictiveInvoices: OicConflictiveInvoice[] = [];
  let okCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let gapUsd = 0;
  let gapUyu = 0;

  for (const inv of invoices ?? []) {
    const meta = inv.zeta_metadata as Record<string, unknown> | null;
    const missingCount = (meta?.missing_saldo_count as number | undefined) ?? 0;
    const balanceDb = (inv.balance_amount as number) ?? 0;

    if (missingCount === 0) {
      okCount++;
      continue;
    }

    const currency = (inv.currency_code as string | null) ?? "UYU";
    const v1 = meta?.zeta_customer_voucher_v1 as Record<string, unknown> | undefined;
    const rawPayload = v1?.raw_payload as Record<string, unknown> | undefined;
    const clienteName =
      (meta?.client_name as string | null) ??
      (rawPayload?.RazonSocial as string | null) ??
      "—";
    const registroId =
      (meta?.zeta_comprobante_identity_v1 as Record<string, unknown> | undefined)
        ?.registro_id as string | null ?? null;

    const sev = invoiceSeverity(balanceDb, missingCount);

    if (sev === "critical") criticalCount++;
    else if (sev === "warning") warningCount++;
    else infoCount++;

    if (currency === "USD") gapUsd += balanceDb;
    else gapUyu += balanceDb;

    conflictiveInvoices.push({
      invoiceId: inv.id as string,
      invoiceNumber: inv.invoice_number as string,
      clienteName: typeof clienteName === "string" ? clienteName : "—",
      currencyCode: currency,
      balanceDb,
      balanceZeta: null,
      gapAmount: balanceDb,
      severity: sev,
      missingCount,
      lastSyncAt: null,
      registroId,
      suggestedAction: suggestedAction(sev),
    });
  }

  const conflictCount = conflictiveInvoices.length;
  const totalChecked = okCount + conflictCount;

  return {
    workspaceCompanyId,
    computedAt,
    totalChecked,
    okCount,
    conflictCount,
    criticalCount,
    warningCount,
    infoCount,
    status: deriveStatus(criticalCount, warningCount, conflictCount),
    gapUsd: Math.round(gapUsd * 100) / 100,
    gapUyu: Math.round(gapUyu * 100) / 100,
    conflictiveInvoices: conflictiveInvoices.slice(0, 50),
    historicalAuditCritical,
    historicalAuditWarning,
    lastAuditAt,
  };
}
