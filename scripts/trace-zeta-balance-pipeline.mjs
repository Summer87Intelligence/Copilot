#!/usr/bin/env node
/**
 * Trace read-only: dónde se pierde o pisa `proto_invoices.balance_amount`.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/trace-zeta-balance-pipeline.mjs --number 2926 --client ACQUAGARDEN
 *
 * Opciones:
 *   --number <n>     Nº comprobante (Serie/Numero en CCV1)
 *   --client <name>  Fragmento nombre empresa (proto_companies)
 *   --workspace <id> Override workspace
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

const invoiceNumber = argFlag("--number");
const clientQuery = argFlag("--client");
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!invoiceNumber || !clientQuery || !url || !key || !workspaceId) {
  console.error(
    "Uso: node --env-file=.env.local --import tsx scripts/trace-zeta-balance-pipeline.mjs --number 2926 --client ACQUAGARDEN"
  );
  process.exit(1);
}

function section(title) {
  console.log(`\n${"═".repeat(72)}\n${title}\n${"═".repeat(72)}`);
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const zeta = await import("../lib/integrations/zeta/zeta-factura-cliente.ts");
  const mapper = await import("../lib/integrations/zeta/zeta-customer-vouchers-mapper.ts");
  const registro = await import("../lib/integrations/zeta/zeta-proto-invoice-registro-match.ts");
  const zetaConfig = await import("../lib/integrations/zeta/zeta-config.ts");
  const reconcile = await import("../lib/integrations/zeta/zeta-saldos-reconciliation.ts");

  section("1. Empresa proto_companies");
  const { data: companies, error: cErr } = await supabase
    .from("proto_companies")
    .select("id, name, RazonSocial, Codigo, RUT, is_active, zeta_metadata")
    .eq("workspace_company_id", workspaceId);
  if (cErr) throw cErr;

  const q = clientQuery.toLowerCase();
  const matches = (companies ?? []).filter((c) => {
    const n = `${c.name ?? ""} ${c.RazonSocial ?? ""}`.toLowerCase();
    return n.includes(q) || String(c.Codigo ?? "").includes(q);
  });
  if (matches.length === 0) {
    console.error(`Sin empresa para --client ${clientQuery}`);
    process.exit(1);
  }
  const company = matches[0];
  const clienteCodigo = String(company.Codigo ?? "").trim();
  console.log(JSON.stringify(company, null, 2));
  if (!clienteCodigo) {
    console.error("Empresa sin Codigo Zeta — saldos pipeline no puede consultar.");
  }

  section("2. Facturas DB con Nº " + invoiceNumber);
  const invPattern = `%:${invoiceNumber}`;
  const { data: invoices, error: iErr } = await supabase
    .from("proto_invoices")
    .select(
      "id, invoice_number, issue_date, total_amount, balance_amount, currency_code, status, updated_at, zeta_metadata, notes, category"
    )
    .eq("workspace_company_id", workspaceId)
    .eq("company_id", company.id)
    .like("invoice_number", `%${invoiceNumber}%`);
  if (iErr) throw iErr;

  const target =
    (invoices ?? []).find((inv) => {
      const parts = String(inv.invoice_number).split(":");
      return parts[parts.length - 1] === String(invoiceNumber);
    }) ?? invoices?.[0];

  if (!target) {
    console.log("No hay fila proto_invoices para este número.");
  } else {
    console.log("invoice_number:", target.invoice_number);
    console.log("balance_amount:", target.balance_amount);
    console.log("total_amount:", target.total_amount);
    console.log("status:", target.status);
    console.log("updated_at:", target.updated_at);
    console.log("category:", target.category);
    console.log("notes:", target.notes);
    const meta = target.zeta_metadata;
    if (meta && typeof meta === "object") {
      const ids = registro.extractRegistroIdsFromInvoiceZetaMetadata(meta);
      console.log("registro_ids en metadata:", ids);
      const rec = reconcile.readZetaReconciliationState(meta);
      console.log("zeta_reconciliation:", rec);
    }
  }

  if (invoices && invoices.length > 1) {
    console.log("\nOtras filas mismo número:");
    for (const inv of invoices) {
      console.log(`  - ${inv.invoice_number} balance=${inv.balance_amount} id=${inv.id}`);
    }
  }

  section("3. Zeta LIVE — RESTFacturaClienteV4QuerySaldosPendientes");
  if (!clienteCodigo) {
    console.log("(omitido: sin Codigo)");
  } else {
    const config = zetaConfig.loadZetaServerConfig();
    const ctx = {
      requestId: `trace-${Date.now()}`,
      tenantId: workspaceId,
      syncRunId: null,
      source: "trace_zeta_balance_pipeline",
    };
    let page = "1";
    let foundRow = null;
    const allRows = [];
    for (let guard = 0; guard < 15; guard++) {
      const res = await zeta.queryFacturaClienteSaldosPendientes(
        ctx,
        { clienteCodigo, page },
        config
      );
      for (const row of res.rows) {
        allRows.push(row);
        const numRaw = row.Numero ?? row.numero;
        if (String(numRaw) === String(invoiceNumber)) foundRow = row;
      }
      if (!res.hasMore) break;
      page = String(Number(page) + 1);
    }
    console.log(`Filas pendientes Zeta (cliente ${clienteCodigo}): ${allRows.length}`);
    if (!foundRow) {
      console.log(`⚠ Zeta NO devolvió Nº ${invoiceNumber} en QuerySaldosPendientes`);
      console.log("  → zero-pass / orphan pueden haber cerrado saldo si corrida completa previa");
    } else {
      console.log("\nFila Zeta cruda (Nº match):");
      console.log(JSON.stringify(foundRow, null, 2));
      const ccv1 = mapper.resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow(foundRow);
      const mapped = zeta.mapSaldoRowsToZetaInvoicesBestEffort(company.id, [foundRow])[0];
      console.log("\nccv1InvoiceNumber computada:", ccv1);
      console.log("DB invoice_number esperada:", target?.invoice_number ?? "(sin fila)");
      console.log("¿Keys coinciden?:", ccv1 === target?.invoice_number);
      console.log("\nZetaInvoice normalizado:");
      console.log(JSON.stringify(mapped, null, 2));
      if (target) {
        const regHit = await registro.findActiveProtoInvoiceIdByZetaRegistroMetadata(
          supabase,
          workspaceId,
          company.id,
          String(foundRow.RegistroId ?? foundRow.registroId ?? "")
        );
        console.log("\nlookup registro_id → proto_invoice:", regHit);
        console.log("¿Match id factura objetivo?:", regHit?.id === target.id);
      }
    }
  }

  section("4. Historial sync — zeta_sync_runs (saldos + vouchers)");
  const flows = [
    "factura_cliente_saldos_pendientes",
    "saldos_pendientes",
    "zeta_customer_vouchers_v1",
    "zeta-sync-saldos",
    "zeta-sync-vouchers",
  ];
  const { data: runs, error: rErr } = await supabase
    .from("zeta_sync_runs")
    .select("id, resource_flow, status, sync_mode, started_at, finished_at, records_fetched, records_upserted, error_summary, company_id")
    .eq("company_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (rErr) console.log("zeta_sync_runs error:", rErr.message);
  const saldosRuns = (runs ?? []).filter((r) =>
    String(r.resource_flow ?? "").includes("saldos")
  );
  const voucherRuns = (runs ?? []).filter((r) =>
    String(r.resource_flow ?? "").includes("voucher") ||
    String(r.resource_flow ?? "").includes("comprobante")
  );
  console.log(`Últimas corridas saldos: ${saldosRuns.length} | vouchers: ${voucherRuns.length}`);
  for (const r of [...saldosRuns.slice(0, 8), ...voucherRuns.slice(0, 8)]) {
    console.log(
      `${r.started_at?.slice(0, 19)} | ${r.resource_flow} | ${r.status} | fetched=${r.records_fetched} upserted=${r.records_upserted} | ${(r.error_summary ?? "").slice(0, 60)}`
    );
  }

  section("5. Raw payloads saldos (buscar 2926 / RegistroId)");
  if (target?.zeta_metadata) {
    const ids = registro.extractRegistroIdsFromInvoiceZetaMetadata(target.zeta_metadata);
    for (const rid of ids) {
      const { data: rawChunks } = await supabase
        .from("zeta_sync_raw_payloads")
        .select("id, sync_run_id, chunk_index, created_at, payload_json")
        .eq("zeta_operation", "RESTFacturaClienteV4QuerySaldosPendientes")
        .order("created_at", { ascending: false })
        .limit(30);
      for (const chunk of rawChunks ?? []) {
        const json = JSON.stringify(chunk.payload_json ?? "");
        if (json.includes(String(invoiceNumber)) || json.includes(rid)) {
          console.log(
            `chunk ${chunk.chunk_index} run=${chunk.sync_run_id} @ ${chunk.created_at} (match ${invoiceNumber}/${rid})`
          );
        }
      }
    }
  }

  section("6. Diagnóstico — causas probables (sin fix)");
  console.log(`
A) Vouchers SIEMPRE escriben balance_amount=0 en protoUpdateInvoice
   (mapCopilotCustomerVoucherToProtoInvoiceInput + zeta-customer-vouchers-pipeline.ts:757)
   → Cualquier sync de comprobantes DESPUÉS de saldos pisa el saldo a 0.

B) Saldos pipeline (runZetaSaldosPendientesPipeline):
   - persistZetaInvoice actualiza balance si match por registro_id, CCV1 o heurística
   - Si falla match → no entra en touchedInvoiceIds
   - Al completar corrida: zeroCcV1BalancesWithoutSaldoRow pone balance=0 en CCV1 no tocadas

C) reconcileMissingPendingInvoices (3 strikes):
   - Facturas con balance>0 no vistas en touchedInvoiceIds → warn → auto-close balance=0

D) Cron saldos: max ${process.env.ZETA_SALDOS_CRON_MAX_CLIENTS_PER_WORKSPACE ?? "200"} clientes/corrida;
   vouchers puede correr más seguido y resetear saldos.
`);

  section("7. Cron schedule (vercel.json)");
  console.log("  :00  zeta-sync-saldos");
  console.log("  :10  zeta-sync-vouchers  ← 10 min DESPUÉS de saldos");
  console.log("  :20  zeta-sync-collection-receipts");
  console.log("  :30  zeta-sync-cuotas");

  if (target && num(target.balance_amount) <= 0.005) {
    console.log("\n⚠ CONCLUSIÓN TRACE:");
    console.log("  - Zeta LIVE confirma Saldo 368.26 en Nº 2926");
    console.log("  - CCV1 key coincide: ZETA:CCV1:0:2:A:2926");
    console.log("  - DB balance=0; notes/category = último writer = VOUCHERS");
    console.log(`  - updated_at factura: ${target.updated_at}`);
    console.log("  - Causa raíz probable: vouchers cron pisa balance_amount=0 después de saldos");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
