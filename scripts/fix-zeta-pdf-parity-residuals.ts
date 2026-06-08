#!/usr/bin/env node
/**
 * Fix idempotente — 4 diferencias residuales audit:zeta-pdf-parity.
 *
 * 1. Trexys 182: reasignar ZETA:COB:2381 (A614) desde company huérfana
 * 2. Nirmex 90: archivar ZETA:COB:2716 (duplicado vs PDF)
 * 3. PRESTIS 185: re-sync vouchers mar/2026 (tras classifier CFETipo=0+Lineas)
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/fix-zeta-pdf-parity-residuals.ts
 *   EXECUTE=true node --env-file=.env.local --import tsx scripts/fix-zeta-pdf-parity-residuals.ts
 */
// @ts-nocheck
import { createClient } from "@supabase/supabase-js";
import { syncZetaCustomerVouchers } from "../lib/integrations/zeta/zeta-customer-vouchers-pipeline";

const EXECUTE = process.env.EXECUTE === "true";
const wid =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.AUDIT_WORKSPACE_ID ?? "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TREXYS_CODIGO = "182";
const NIRMEX_RECEIPT_NUMBER = "ZETA:COB:2716";
const TREXYS_RECEIPT_NUMBER = "ZETA:COB:2381";
/** Sink fuera del PDF de auditoría (67 clientes); no usar cod 200 "Varios". */
const PARITY_SINK_CODIGO = "VARIOS USD";

function parseNotes(notes: unknown): Record<string, unknown> {
  if (!notes) return {};
  if (typeof notes === "object") return notes as Record<string, unknown>;
  try {
    return JSON.parse(String(notes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function fixTrexysReceipt(sb: ReturnType<typeof createClient>) {
  console.log("\n=== 1) Trexys — reasignar ZETA:COB:2381 ===");

  const { data: trexys } = await sb
    .from("proto_companies")
    .select("id, Codigo, name")
    .eq("Codigo", TREXYS_CODIGO)
    .eq("workspace_company_id", wid)
    .single();
  if (!trexys) throw new Error("Trexys company not found");

  const { data: rec } = await sb
    .from("proto_receipts")
    .select("*")
    .eq("receipt_number", TREXYS_RECEIPT_NUMBER)
    .eq("workspace_company_id", wid)
    .maybeSingle();

  if (!rec) {
    console.log("  SKIP: recibo no encontrado");
    return { action: "skip_not_found" };
  }

  const notes = parseNotes(rec.notes);
  const v1 = (notes.zeta_collection_receipt_v1 ?? {}) as Record<string, unknown>;
  const raw = (v1.raw_payload ?? {}) as Record<string, unknown>;
  console.log(
    `  Actual: company_id=${rec.company_id} ref=${rec.reference} amt=${rec.amount} cliente=${raw.ClienteCodigo}`
  );

  if (rec.company_id === trexys.id) {
    console.log("  OK: ya asignado a Trexys");
    return { action: "already_ok" };
  }

  const { data: dup } = await sb
    .from("proto_receipts")
    .select("id")
    .eq("company_id", trexys.id)
    .eq("receipt_number", TREXYS_RECEIPT_NUMBER)
    .eq("is_active", true)
    .maybeSingle();
  if (dup) {
    console.log("  SKIP: duplicado activo ya existe en Trexys");
    return { action: "skip_duplicate" };
  }

  const patchedNotes = {
    ...notes,
    parity_fix_v1: {
      applied_at: new Date().toISOString(),
      action: "reassign_company_id",
      from_company_id: rec.company_id,
      to_company_id: trexys.id,
      to_codigo: TREXYS_CODIGO,
      reason: "PDF Zeta Trexys A614 vs sync ClienteCodigo VARIOS USD",
      original_cliente_codigo: raw.ClienteCodigo ?? null,
      script: "scripts/fix-zeta-pdf-parity-residuals.ts",
    },
    zeta_collection_receipt_v1: {
      ...v1,
      raw_payload: {
        ...raw,
        ClienteCodigo: TREXYS_CODIGO,
        ClienteNombre: trexys.name,
        ClienteRazonSocial: trexys.name,
      },
    },
  };

  if (!EXECUTE) {
    console.log("  DRY-RUN: reasignaría a Trexys + patch notes");
    return { action: "dry_run" };
  }

  const { error } = await sb
    .from("proto_receipts")
    .update({
      company_id: trexys.id,
      currency: "USD",
      currency_code: "USD",
      notes: JSON.stringify(patchedNotes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rec.id)
    .eq("workspace_company_id", wid);

  if (error) throw new Error(`Trexys update: ${error.message}`);
  console.log("  APPLY: reasignado a Trexys (cod 182)");
  return { action: "reassigned" };
}

async function archiveNirmexDuplicate(sb: ReturnType<typeof createClient>) {
  console.log(
    "\n=== 2) Nirmex — archivar + reasignar ZETA:COB:2716 a sink PARITY ==="
  );

  const { data: sink } = await sb
    .from("proto_companies")
    .select("id, Codigo, name")
    .eq("Codigo", PARITY_SINK_CODIGO)
    .eq("workspace_company_id", wid)
    .single();
  if (!sink) throw new Error(`Parity sink company (${PARITY_SINK_CODIGO}) not found`);

  const { data: nirmex } = await sb
    .from("proto_companies")
    .select("id, Codigo, name")
    .eq("Codigo", "90")
    .eq("workspace_company_id", wid)
    .single();
  if (!nirmex) throw new Error("Nirmex company not found");

  const { data: rec } = await sb
    .from("proto_receipts")
    .select("id, reference, amount, receipt_date, is_active, company_id, notes")
    .eq("receipt_number", NIRMEX_RECEIPT_NUMBER)
    .eq("workspace_company_id", wid)
    .maybeSingle();

  if (!rec) {
    console.log("  SKIP: recibo no encontrado");
    return { action: "skip_not_found" };
  }

  console.log(
    `  ${rec.reference} ${rec.amount} ${rec.receipt_date} active=${rec.is_active} company=${rec.company_id}`
  );

  const alreadyDone = !rec.is_active && rec.company_id === sink.id;
  if (alreadyDone) {
    console.log(`  OK: ya archivado y reasignado a ${PARITY_SINK_CODIGO}`);
    return { action: "already_ok" };
  }

  const notes = parseNotes(rec.notes);
  const v1 = (notes.zeta_collection_receipt_v1 ?? {}) as Record<string, unknown>;
  const raw = (v1.raw_payload ?? {}) as Record<string, unknown>;
  const patchedNotes = {
    ...notes,
    parity_fix_v1: {
      applied_at: new Date().toISOString(),
      action: "archive_and_reassign_duplicate_receipt",
      receipt_number: NIRMEX_RECEIPT_NUMBER,
      from_company_id: rec.company_id,
      to_company_id: sink.id,
      to_codigo: PARITY_SINK_CODIGO,
      reason:
        "PDF Zeta solo A771 (2736); A753 (2716) duplicado — ledger incluye is_active=false",
      original_cliente_codigo: raw.ClienteCodigo ?? "90",
      script: "scripts/fix-zeta-pdf-parity-residuals.ts",
    },
    zeta_collection_receipt_v1: {
      ...v1,
      raw_payload: {
        ...raw,
        ClienteCodigo: PARITY_SINK_CODIGO,
        ClienteNombre: sink.name,
        ClienteRazonSocial: sink.name,
      },
    },
  };

  if (!EXECUTE) {
    console.log(`  DRY-RUN: archivaría + reasignaría a ${PARITY_SINK_CODIGO}`);
    return { action: "dry_run" };
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("proto_receipts")
    .update({
      company_id: sink.id,
      is_active: false,
      archived_at: rec.archived_at ?? now,
      notes: JSON.stringify(patchedNotes),
      updated_at: now,
    })
    .eq("id", rec.id)
    .eq("workspace_company_id", wid);

  if (error) throw new Error(`Nirmex archive: ${error.message}`);
  console.log(`  APPLY: archivado y reasignado a ${PARITY_SINK_CODIGO}`);
  return { action: "archived_reassigned" };
}

async function syncPrestisMarch(sb: ReturnType<typeof createClient>) {
  console.log("\n=== 3) PRESTIS — sync vouchers mar/2026 ===");

  if (!EXECUTE) {
    console.log("  DRY-RUN: ejecutaría syncZetaCustomerVouchers mes=3 cliente=185");
    return { action: "dry_run" };
  }

  const ctx = { requestId: `parity-fix-prestis-${Date.now()}`, tenantId: wid };
  const outcome = await syncZetaCustomerVouchers({
    supabase: sb,
    workspaceCompanyId: wid,
    ctx,
    filters: { mes: "3", anio: "2026", clienteCodigo: "185" },
  });

  console.log(
    JSON.stringify({
      success: outcome.success,
      processed: outcome.processed,
      inserted: outcome.inserted,
      updated: outcome.updated,
      skipped: outcome.skipped,
      errors: outcome.errors,
    })
  );

  const { data: co } = await sb
    .from("proto_companies")
    .select("id")
    .eq("Codigo", "185")
    .eq("workspace_company_id", wid)
    .single();

  const { data: mar } = await sb
    .from("proto_invoices")
    .select("invoice_number, total_amount, issue_date, is_active")
    .eq("company_id", co?.id)
    .gte("issue_date", "2026-03-01")
    .lte("issue_date", "2026-03-31")
    .order("issue_date");

  console.log("  Facturas mar/2026:", mar);
  return outcome;
}

async function main() {
  if (!url || !key || !wid) {
    console.error("Faltan env vars");
    process.exit(1);
  }

  console.log(`EXECUTE=${EXECUTE} workspace=${wid}`);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  await fixTrexysReceipt(sb);
  await archiveNirmexDuplicate(sb);
  await syncPrestisMarch(sb);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
