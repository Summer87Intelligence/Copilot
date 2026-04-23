/**
 * Batch operativo: `sync-saldos-pendientes` (mismo código que el endpoint) cliente por cliente,
 * para facturas Zeta (vouchers) de enero 2026 con saldo abierto en un workspace dado.
 *
 * Requisitos:
 * - `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (misma convención que el servidor).
 * - Credenciales Zeta en env (vía `loadZetaServerConfig` dentro del pipeline).
 *
 * Ejecución recomendada (Node 20.6+):
 *   node --env-file=.env.local --import tsx scripts/batch-zeta-saldos-enero-2026.ts
 *
 * O con npm:
 *   npm run zeta:batch:saldos:enero2026
 *
 * Variables opcionales:
 * - `DRY_RUN=1` — solo lista clientes y conteos, no llama a Zeta.
 * - `PAUSE_MS` — pausa entre clientes (default 800).
 * - `CONTINUE_ON_ERROR` — `false` para abortar al primer error (default `true`).
 * - `BATCH_WORKSPACE_COMPANY_ID` — override del UUID tenant (default: fijo enero 2026 operación).
 * - `BATCH_INVOICE_CATEGORY` — override de categoría (default: `Zeta / comprobantes por cliente`).
 * - `BATCH_ISSUE_FROM` / `BATCH_ISSUE_TO` — rango `issue_date` (default 2026-01-01 .. 2026-02-01 exclusivo fin).
 *
 * SQL de validación (copiar en Supabase SQL editor) — ANTES:
 *
 *   select count(*) as open_invoices
 *   from proto_invoices
 *   where workspace_company_id = '040321ff-10fd-4da3-aeca-f1865f879986'
 *     and category = 'Zeta / comprobantes por cliente'
 *     and issue_date >= '2026-01-01'
 *     and issue_date < '2026-02-01'
 *     and balance_amount > 0
 *     and coalesce(is_active, true) = true;
 *
 *   select company_id, split_part(invoice_number, ':', 4) as cliente_zeta_codigo, count(*) as n
 *   from proto_invoices
 *   where workspace_company_id = '040321ff-10fd-4da3-aeca-f1865f879986'
 *     and category = 'Zeta / comprobantes por cliente'
 *     and issue_date >= '2026-01-01'
 *     and issue_date < '2026-02-01'
 *     and balance_amount > 0
 *     and coalesce(is_active, true) = true
 *   group by 1, 2
 *   order by n desc;
 *
 * DESPUÉS: repetir el primer `count(*)` y comparar.
 */

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";

const DEFAULT_WORKSPACE = "040321ff-10fd-4da3-aeca-f1865f879986";
const DEFAULT_CATEGORY = "Zeta / comprobantes por cliente";
const DEFAULT_ISSUE_FROM = "2026-01-01";
const DEFAULT_ISSUE_TO = "2026-02-01";

function envBool(name: string, defaultTrue: boolean): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defaultTrue;
  return v === "1" || v === "true" || v === "yes";
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Segmento cliente Zeta en `ZETA:CCV1:{emp}:{cli}:…` (índice 0-based = 3 ⇒ cuarto segmento, como `split_part(...,4)` en SQL). */
function deriveClienteZetaCodigoFromInvoiceNumber(invoiceNumber: string): string | null {
  const parts = String(invoiceNumber).trim().split(":");
  if (parts.length < 4) return null;
  if (parts[0] !== "ZETA" || parts[1] !== "CCV1") return null;
  const cod = String(parts[3] ?? "").trim();
  return cod || null;
}

async function fetchCodigoFromProtoCompany(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("Codigo")
    .eq("id", companyId)
    .eq("workspace_company_id", workspaceId)
    .maybeSingle();
  if (error) return null;
  const row = data as { Codigo?: unknown } | null;
  const c = row?.Codigo != null ? String(row.Codigo).trim() : "";
  return c || null;
}

type TargetRow = { company_id: string; invoice_number: string };

async function fetchTargetRows(
  supabase: SupabaseClient,
  workspaceId: string,
  category: string,
  issueFrom: string,
  issueTo: string
): Promise<TargetRow[]> {
  const pageSize = 1000;
  const out: TargetRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select("company_id, invoice_number")
      .eq("workspace_company_id", workspaceId)
      .eq("category", category)
      .gte("issue_date", issueFrom)
      .lt("issue_date", issueTo)
      .gt("balance_amount", 0)
      .or("is_active.is.null,is_active.eq.true")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`proto_invoices select: ${error.message}`);
    const rows = (data ?? []) as TargetRow[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function countOpenMatching(
  supabase: SupabaseClient,
  workspaceId: string,
  category: string,
  issueFrom: string,
  issueTo: string
): Promise<number> {
  const { count, error } = await supabase
    .from("proto_invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_company_id", workspaceId)
    .eq("category", category)
    .gte("issue_date", issueFrom)
    .lt("issue_date", issueTo)
    .gt("balance_amount", 0)
    .or("is_active.is.null,is_active.eq.true");
  if (error) throw new Error(`count open: ${error.message}`);
  return count ?? 0;
}

async function countOpenForCompany(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  category: string,
  issueFrom: string,
  issueTo: string
): Promise<number> {
  const { count, error } = await supabase
    .from("proto_invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_company_id", workspaceId)
    .eq("company_id", companyId)
    .eq("category", category)
    .gte("issue_date", issueFrom)
    .lt("issue_date", issueTo)
    .gt("balance_amount", 0)
    .or("is_active.is.null,is_active.eq.true");
  if (error) throw new Error(`count open company: ${error.message}`);
  return count ?? 0;
}

type ClientJob = {
  proto_company_id: string;
  cliente_codigo: string;
  invoice_sample: string;
  rows_hint: number;
};

async function buildClientJobs(
  supabase: SupabaseClient,
  workspaceId: string,
  category: string,
  issueFrom: string,
  issueTo: string
): Promise<ClientJob[]> {
  const rows = await fetchTargetRows(supabase, workspaceId, category, issueFrom, issueTo);
  const byKey = new Map<
    string,
    { proto_company_id: string; cliente_codigo: string | null; invoice_sample: string; n: number }
  >();

  for (const r of rows) {
    const cid = String(r.company_id ?? "").trim();
    const inv = String(r.invoice_number ?? "");
    if (!cid || !inv) continue;
    let cli = deriveClienteZetaCodigoFromInvoiceNumber(inv);
    if (!cli) {
      cli = await fetchCodigoFromProtoCompany(supabase, workspaceId, cid);
    }
    if (!cli) {
      console.warn(
        JSON.stringify({
          tag: "batch_zeta_saldos_warn",
          message: "skip_row_no_cliente_codigo",
          company_id: cid,
          invoice_number: inv,
        })
      );
      continue;
    }
    const key = `${cid}\t${cli}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.n += 1;
    } else {
      byKey.set(key, { proto_company_id: cid, cliente_codigo: cli, invoice_sample: inv, n: 1 });
    }
  }

  const jobs: ClientJob[] = [...byKey.values()]
    .filter((v): v is typeof v & { cliente_codigo: string } => Boolean(v.cliente_codigo))
    .map((v) => ({
      proto_company_id: v.proto_company_id,
      cliente_codigo: v.cliente_codigo as string,
      invoice_sample: v.invoice_sample,
      rows_hint: v.n,
    }))
    .sort((a, b) => a.cliente_codigo.localeCompare(b.cliente_codigo));

  return jobs;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Cargá .env.local (p. ej. node --env-file=.env.local …)."
    );
    process.exit(1);
  }

  const workspaceId = process.env.BATCH_WORKSPACE_COMPANY_ID?.trim() || DEFAULT_WORKSPACE;
  const category = process.env.BATCH_INVOICE_CATEGORY?.trim() || DEFAULT_CATEGORY;
  const issueFrom = process.env.BATCH_ISSUE_FROM?.trim() || DEFAULT_ISSUE_FROM;
  const issueTo = process.env.BATCH_ISSUE_TO?.trim() || DEFAULT_ISSUE_TO;
  const dryRun = (process.env.DRY_RUN ?? "").trim() === "1";
  const pauseMs = envInt("PAUSE_MS", 800);
  const continueOnError = envBool("CONTINUE_ON_ERROR", true);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const openBefore = await countOpenMatching(supabase, workspaceId, category, issueFrom, issueTo);
  console.log(
    JSON.stringify({
      tag: "batch_zeta_saldos_start",
      workspace_company_id: workspaceId,
      category,
      issue_from: issueFrom,
      issue_to: issueTo,
      open_invoices_before: openBefore,
      dry_run: dryRun,
    })
  );

  const jobs = await buildClientJobs(supabase, workspaceId, category, issueFrom, issueTo);
  console.log(
    JSON.stringify({
      tag: "batch_zeta_saldos_jobs",
      distinct_clients: jobs.length,
      jobs,
    })
  );

  if (dryRun) {
    console.log(
      JSON.stringify({
        tag: "batch_zeta_saldos_done",
        dry_run: true,
        open_invoices_before: openBefore,
        open_invoices_after_skipped: "(no ejecutado)",
      })
    );
    return;
  }

  let ok = 0;
  let err = 0;
  const errors: { cliente_codigo: string; proto_company_id: string; detail: string }[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const requestId = randomUUID();
    const openForClientBefore = await countOpenForCompany(
      supabase,
      workspaceId,
      job.proto_company_id,
      category,
      issueFrom,
      issueTo
    );

    let result;
    try {
      result = await runZetaSaldosPendientesPipeline(supabase, workspaceId, requestId, {
        protoCompanyId: job.proto_company_id,
        clienteCodigo: job.cliente_codigo,
        mode: "incremental",
        idempotencyKey: `batch-enero2026-${job.proto_company_id}-${job.cliente_codigo}-${Date.now()}`,
      });
    } catch (e) {
      err += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({
        cliente_codigo: job.cliente_codigo,
        proto_company_id: job.proto_company_id,
        detail: msg,
      });
      console.error(
        JSON.stringify({
          tag: "batch_zeta_saldos_client_error",
          cliente_codigo: job.cliente_codigo,
          proto_company_id: job.proto_company_id,
          invoice_sample: job.invoice_sample,
          rows_hint: job.rows_hint,
          open_invoices_company_before: openForClientBefore,
          error: msg,
        })
      );
      if (!continueOnError) process.exit(1);
      if (i < jobs.length - 1 && pauseMs > 0) await sleep(pauseMs);
      continue;
    }

    const openForClientAfter = await countOpenForCompany(
      supabase,
      workspaceId,
      job.proto_company_id,
      category,
      issueFrom,
      issueTo
    );

    if (result.ok) ok += 1;
    else err += 1;

    console.log(
      JSON.stringify({
        tag: "batch_zeta_saldos_client_done",
        cliente_codigo: job.cliente_codigo,
        proto_company_id: job.proto_company_id,
        invoice_sample: job.invoice_sample,
        rows_hint: job.rows_hint,
        open_invoices_company_before: openForClientBefore,
        open_invoices_company_after: openForClientAfter,
        pipeline: {
          ok: result.ok,
          sync_run_id: result.sync_run_id,
          stopped_reason: result.stopped_reason,
          pages_fetched: result.pages_fetched,
          rows_normalized: result.rows_normalized,
          rows_upserted: result.rows_upserted,
          error_summary: result.error_summary ?? null,
        },
      })
    );

    if (i < jobs.length - 1 && pauseMs > 0) await sleep(pauseMs);
  }

  const openAfter = await countOpenMatching(supabase, workspaceId, category, issueFrom, issueTo);

  console.log(
    JSON.stringify({
      tag: "batch_zeta_saldos_summary",
      workspace_company_id: workspaceId,
      clients_total: jobs.length,
      clients_pipeline_ok: ok,
      clients_pipeline_error: err,
      open_invoices_before: openBefore,
      open_invoices_after: openAfter,
      errors,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
