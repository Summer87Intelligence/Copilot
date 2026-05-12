#!/usr/bin/env node
/**
 * Backfill `proto_invoice_installments` para un workspace.
 *
 * Llama a `POST /api/zeta/sync-installments-backfill` autenticado con
 * `CRON_SECRET`. Cubre la FASE 5 del rollout: recorre clientes activos del
 * workspace, trae cuotas, upserta installments y opcionalmente migra
 * `proto_invoices.due_date` al valor real (`zeta_cuotas_v1`).
 *
 * NO TOCA:
 *  - Saldos (`proto_invoices.balance_amount`).
 *  - Vouchers (`proto_invoices` mappings nuevos).
 *  - Reconciliación de orphans de saldos.
 *
 * Uso:
 *
 *   BASE_URL=http://localhost:3000             \
 *   CRON_SECRET=<secreto>                       \
 *   WORKSPACE_COMPANY_ID=<uuid>                 \
 *   node scripts/zeta-backfill-installments.mjs \
 *     [--clientes 2,17,42] [--max 50] [--dry-run] [--no-due-date]
 *
 * Variables:
 *  - BASE_URL              — default http://localhost:3000.
 *  - CRON_SECRET           — required.
 *  - WORKSPACE_COMPANY_ID  — required (uuid).
 *
 * Banderas:
 *  - `--clientes <CSV>`   procesar solo esos Codigo.
 *  - `--max <N>`          cap de clientes (default 50).
 *  - `--dry-run`          listar elegibles sin llamar a Zeta.
 *  - `--no-due-date`      no actualizar `due_date` (solo poblar installments).
 *  - `--page-delay <ms>`  default 400.
 *  - `--client-delay <ms>` default 600.
 *  - `--max-pages <N>`    máximo de páginas por cliente (default 5).
 */
import process from "node:process";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const CRON_SECRET = (process.env.CRON_SECRET ?? "").trim();
const WORKSPACE_COMPANY_ID = (process.env.WORKSPACE_COMPANY_ID ?? "").trim();

if (!CRON_SECRET) {
  console.error("Falta CRON_SECRET. Abortando.");
  process.exit(1);
}
if (!WORKSPACE_COMPANY_ID) {
  console.error("Falta WORKSPACE_COMPANY_ID. Abortando.");
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    clientes: null,
    max: 50,
    dryRun: false,
    updateDueDate: true,
    pageDelayMs: 400,
    clientDelayMs: 600,
    maxPagesPerClient: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--clientes") args.clientes = String(v).split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--max") args.max = Number.parseInt(v, 10);
    else if (k === "--dry-run") args.dryRun = true;
    else if (k === "--no-due-date") args.updateDueDate = false;
    else if (k === "--page-delay") args.pageDelayMs = Number.parseInt(v, 10);
    else if (k === "--client-delay") args.clientDelayMs = Number.parseInt(v, 10);
    else if (k === "--max-pages") args.maxPagesPerClient = Number.parseInt(v, 10);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const body = {
    workspaceCompanyId: WORKSPACE_COMPANY_ID,
    maxClients: Number.isFinite(args.max) && args.max > 0 ? args.max : 50,
    updateInvoiceDueDate: args.updateDueDate,
    dryRun: args.dryRun,
    pageDelayMs: args.pageDelayMs,
    clientDelayMs: args.clientDelayMs,
    maxPagesPerClient: args.maxPagesPerClient,
  };
  if (args.clientes && args.clientes.length > 0) body.clienteCodigos = args.clientes;

  console.log("Backfill installments:", {
    base_url: BASE_URL,
    workspace_company_id: WORKSPACE_COMPANY_ID,
    body,
  });

  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/zeta/sync-installments-backfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify(body),
  });

  let json = null;
  let txt = "";
  try {
    json = await res.json();
  } catch {
    txt = await res.text().catch(() => "");
  }

  const elapsedMs = Date.now() - t0;
  console.log(
    JSON.stringify(
      {
        http_status: res.status,
        elapsed_ms: elapsedMs,
        body: json,
        text_fallback_preview: txt ? txt.slice(0, 1000) : null,
      },
      null,
      2
    )
  );

  if (!res.ok) process.exit(2);

  if (json && Array.isArray(json.client_results)) {
    const totals = {
      ok: 0,
      partial: 0,
      failed: 0,
    };
    for (const c of json.client_results) {
      if (c.errors?.length > 0) totals.failed += 1;
      else if (c.rows_orphan > 0 && c.rows_linked === 0) totals.partial += 1;
      else totals.ok += 1;
    }
    console.log("Resumen por cliente:", totals);
  }
}

main().catch((err) => {
  console.error("zeta-backfill-installments falló:", err);
  process.exit(1);
});
