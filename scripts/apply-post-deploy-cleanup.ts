#!/usr/bin/env node
/**
 * Post-deploy cleanup controlado — audit:zeta-pdf-parity residuales.
 * Uso: node --env-file=.env.local --import tsx scripts/apply-post-deploy-cleanup.ts
 */
// @ts-nocheck — script operativo one-off; tipos Supabase genéricos en CLI.
import { createClient } from "@supabase/supabase-js";
import { syncZetaCollectionReceipts } from "../lib/integrations/zeta/zeta-collection-receipts-pipeline";
import { syncZetaCustomerVouchers } from "../lib/integrations/zeta/zeta-customer-vouchers-pipeline";

const CODIGOS_OPENING = [
  "60", "67", "121", "158", "85", "125", "149", "151", "157", "170", "171",
] as const;

const EXPECTED_PRE_2026: Record<string, { count: number; debe: number }> = {
  "60": { count: 3, debe: 329.4 },
  "67": { count: 2, debe: 244 },
  "121": { count: 3, debe: 3897 },
  "158": { count: 1, debe: 463.6 },
  "85": { count: 1, debe: 9760 },
  "125": { count: 2, debe: 34160 },
  "149": { count: 1, debe: 17080 },
  "151": { count: 2, debe: 42944 },
  "157": { count: 2, debe: 19520 },
  "170": { count: 1, debe: 7320 },
  "171": { count: 1, debe: 15860 },
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const wid =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.AUDIT_WORKSPACE_ID ?? "";

function near(a: number, b: number, tol = 0.02): boolean {
  return Math.abs(a - b) <= tol;
}

async function verifyBlockA(
  sb: ReturnType<typeof createClient>
): Promise<{ ok: boolean; rows: Array<Record<string, unknown>> }> {
  const { data: companies, error } = await sb
    .from("proto_companies")
    .select("id, Codigo, RazonSocial, ledger_opening_balance_uyu, ledger_opening_balance_usd")
    .eq("workspace_company_id", wid)
    .in("Codigo", [...CODIGOS_OPENING]);

  if (error) throw new Error(error.message);
  if ((companies ?? []).length !== CODIGOS_OPENING.length) {
    console.error(`Esperados ${CODIGOS_OPENING.length} clientes, encontrados ${companies?.length ?? 0}`);
    return { ok: false, rows: [] };
  }

  const rows: Array<Record<string, unknown>> = [];

  for (const c of companies ?? []) {
    const codigo = String(c.Codigo);
    const { data: invs, error: ie } = await sb
      .from("proto_invoices")
      .select("id, total_amount, issue_date")
      .eq("company_id", c.id)
      .eq("is_active", true)
      .lt("issue_date", "2026-01-01");
    if (ie) throw new Error(ie.message);

    const count = invs?.length ?? 0;
    const debe = Math.round(
      (invs ?? []).reduce((s, i) => s + Number(i.total_amount ?? 0), 0) * 100
    ) / 100;
    const exp = EXPECTED_PRE_2026[codigo];
    const match = exp && count === exp.count && near(debe, exp.debe);

    rows.push({
      Codigo: codigo,
      RazonSocial: c.RazonSocial,
      ob_uyu: c.ledger_opening_balance_uyu,
      ob_usd: c.ledger_opening_balance_usd,
      inv_pre_2026: count,
      debe_pre_2026: debe,
      expected: exp,
      match,
    });
    if (!match) {
      console.error(`Mismatch cod ${codigo}: count=${count} debe=${debe} expected`, exp);
    }
  }

  rows.sort((a, b) => Number(a.Codigo) - Number(b.Codigo));
  const ok = rows.length === 11 && rows.every((r) => r.match === true);
  return { ok, rows };
}

async function archivePre2026(sb: ReturnType<typeof createClient>): Promise<number> {
  const { data: companies } = await sb
    .from("proto_companies")
    .select("id, Codigo, ledger_opening_balance_uyu, ledger_opening_balance_usd")
    .eq("workspace_company_id", wid)
    .in("Codigo", [...CODIGOS_OPENING]);

  let total = 0;
  const now = new Date().toISOString();

  for (const c of companies ?? []) {
    const cod = String(c.Codigo);
    const usd = ["60", "67", "121", "158"].includes(cod);
    const uyu = !usd;
    const ob = usd ? c.ledger_opening_balance_usd : c.ledger_opening_balance_uyu;
    if (ob == null) continue;

    const { data, error } = await sb
      .from("proto_invoices")
      .update({
        is_active: false,
        archived_at: now,
        updated_at: now,
      })
      .eq("company_id", c.id)
      .lt("issue_date", "2026-01-01")
      .eq("is_active", true)
      .select("id");

    if (error) throw new Error(`archive cod ${cod}: ${error.message}`);
    total += data?.length ?? 0;
    console.log(`  Archivadas ${data?.length ?? 0} facturas pre-2026 — cod ${cod}`);
  }
  return total;
}

async function main() {
  if (!url || !key || !wid) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKSPACE_COMPANY_ID");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const ctx = { requestId: `post-deploy-cleanup-${Date.now()}`, tenantId: wid };

  console.log("=".repeat(72));
  console.log("PASO 1 — Verificación bloque A (11 clientes DIFF_OPENING)");
  console.log("=".repeat(72));

  const { ok, rows } = await verifyBlockA(sb);
  for (const r of rows) {
    console.log(
      `  cod=${r.Codigo} inv_pre=${r.inv_pre_2026} debe=${r.debe_pre_2026} match=${r.match}`
    );
  }

  if (!ok) {
    console.error("ABORT: verificación no coincide con los 11 clientes esperados.");
    process.exit(1);
  }

  console.log("\nPASO 2 — Archivar proto_invoices pre-2026");
  const archived = await archivePre2026(sb);
  console.log(`  Total archivadas: ${archived}`);

  console.log("\nPASO 3 — Re-sync Trexys recibos marzo 2026 (cod 182)");
  const trexys = await syncZetaCollectionReceipts({
    supabase: sb,
    workspaceCompanyId: wid,
    ctx,
    filters: { mes: "3", anio: "2026", clienteCodigo: "182" },
  });
  console.log(JSON.stringify(trexys, null, 2));

  console.log("\nPASO 4 — Re-sync PRESTIS facturas marzo 2026 (cod 185)");
  const prestis = await syncZetaCustomerVouchers({
    supabase: sb,
    workspaceCompanyId: wid,
    ctx: { ...ctx, requestId: `${ctx.requestId}-prestis` },
    filters: { mes: "3", anio: "2026", clienteCodigo: "185" },
  });
  console.log(
    JSON.stringify(
      {
        success: prestis.success,
        processed: prestis.processed,
        inserted: prestis.inserted,
        updated: prestis.updated,
        skipped: prestis.skipped,
        errors: prestis.errors,
        duration_ms: prestis.duration_ms,
        message: prestis.message,
      },
      null,
      2
    )
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
