/**
 * Diagnóstico automatizado: ejecuta `runZetaSaldosPendientesPipeline` por cliente
 * (mismos filtros que facturas Zeta abiertas ene-2026) y clasifica el resultado.
 *
 * No modifica lógica de negocio ni el pipeline; solo lectura + corridas de sync.
 *
 * Requisitos:
 * - `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 * - Credenciales Zeta en env (como el batch / servidor)
 *
 * Ejecución:
 *   node --env-file=.env.local --import tsx scripts/debug-zeta-clientes.ts
 *
 * Opcional:
 * - `DRY_RUN=1` — arma grupos y conteos, no llama a Zeta.
 * - `PAUSE_MS` — pausa entre clientes (default 800).
 * - `CONTINUE_ON_ERROR` — default `true` (seguir tras error).
 * - `ZETA_SALDOS_DIAG=1` — logs extra del pipeline (`diagLog` interno).
 * - `DEBUG_WORKSPACE_COMPANY_ID`, `DEBUG_INVOICE_CATEGORY`, `DEBUG_ISSUE_FROM`, `DEBUG_ISSUE_TO`
 */

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";
import type { ZetaSaldosPipelineResult } from "@/lib/integrations/zeta/zeta-pipeline-types";

const DEFAULT_WORKSPACE = "040321ff-10fd-4da3-aeca-f1865f879986";
const DEFAULT_CATEGORY = "Zeta / comprobantes por cliente";
const DEFAULT_ISSUE_FROM = "2026-01-01";
const DEFAULT_ISSUE_TO = "2026-02-01";

type Diagnosis = "ZETA_EMPTY" | "MATCHING_PROBLEM" | "PIPELINE_ERROR" | "UPDATED_OK" | "UNKNOWN";

function envBool(name: string, defaultTrue: boolean): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defaultTrue;
  return v === "1" || v === "true" || v === "yes";
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** `ZETA:CCV1:{emp}:{cli}:…` → segmento índice 3 = código cliente Zeta. */
function deriveClienteCodigoFromCcv1InvoiceNumber(invoiceNumber: string): string | null {
  const parts = String(invoiceNumber).trim().split(":");
  if (parts.length < 4) return null;
  if (parts[0] !== "ZETA" || parts[1] !== "CCV1") return null;
  const cod = String(parts[3] ?? "").trim();
  return cod || null;
}

type InvoiceRow = { company_id: string; invoice_number: string };

async function fetchOpenInvoicesJan2026(
  supabase: SupabaseClient,
  workspaceId: string,
  category: string,
  issueFrom: string,
  issueTo: string
): Promise<InvoiceRow[]> {
  const pageSize = 1000;
  const out: InvoiceRow[] = [];
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
    const rows = (data ?? []) as InvoiceRow[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
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

type ClientGroup = {
  proto_company_id: string;
  cliente_codigo: string;
  sample_invoice_number: string;
  open_invoice_rows: number;
};

function buildClientGroups(rows: InvoiceRow[]): { groups: ClientGroup[]; skipped_non_ccv1: number } {
  const map = new Map<
    string,
    { proto_company_id: string; cliente_codigo: string; sample_invoice_number: string; n: number }
  >();
  let skipped = 0;

  for (const r of rows) {
    const cid = String(r.company_id ?? "").trim();
    const inv = String(r.invoice_number ?? "");
    if (!cid || !inv) continue;
    const cli = deriveClienteCodigoFromCcv1InvoiceNumber(inv);
    if (!cli) {
      skipped += 1;
      continue;
    }
    const key = `${cid}\t${cli}`;
    const prev = map.get(key);
    if (prev) {
      prev.n += 1;
    } else {
      map.set(key, {
        proto_company_id: cid,
        cliente_codigo: cli,
        sample_invoice_number: inv,
        n: 1,
      });
    }
  }

  const groups: ClientGroup[] = [...map.values()].map((v) => ({
    proto_company_id: v.proto_company_id,
    cliente_codigo: v.cliente_codigo,
    sample_invoice_number: v.sample_invoice_number,
    open_invoice_rows: v.n,
  }));

  groups.sort((a, b) => {
    const c = a.proto_company_id.localeCompare(b.proto_company_id);
    return c !== 0 ? c : a.cliente_codigo.localeCompare(b.cliente_codigo);
  });

  return { groups, skipped_non_ccv1: skipped };
}

/**
 * Clasificación pedida, con prioridad cuando varias condiciones podrían aplicar:
 * - Fallo de corrida (`stopped_reason !== "completed"` o excepción) → PIPELINE_ERROR
 * - Si completó OK: upserts → UPDATED_OK; filas sin persistir → MATCHING_PROBLEM; vacío con páginas → ZETA_EMPTY
 */
function classifyDiagnosis(params: {
  threw: boolean;
  stopped_reason: ZetaSaldosPipelineResult["stopped_reason"] | "exception";
  pages_fetched: number;
  rows_normalized: number;
  rows_upserted: number;
}): Diagnosis {
  if (params.threw || params.stopped_reason !== "completed") {
    return "PIPELINE_ERROR";
  }
  if (params.rows_upserted > 0) return "UPDATED_OK";
  if (params.rows_normalized > 0 && params.rows_upserted === 0) return "MATCHING_PROBLEM";
  if (params.rows_normalized === 0 && params.pages_fetched >= 1) return "ZETA_EMPTY";
  return "UNKNOWN";
}

type PerClientResult = {
  cliente_codigo: string;
  proto_company_id: string;
  open_before: number;
  open_after: number;
  pages_fetched: number;
  rows_normalized: number;
  rows_upserted: number;
  stopped_reason: ZetaSaldosPipelineResult["stopped_reason"] | "exception" | "skipped_dry_run";
  diagnosis: Diagnosis | "DRY_RUN";
  sync_run_id: string | null;
  error_summary: string | null;
  pipeline_ok: boolean | null;
  sample_invoice_number: string;
  open_invoice_rows_hint: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Usá p. ej. node --env-file=.env.local --import tsx …"
    );
    process.exit(1);
  }

  const workspaceId = process.env.DEBUG_WORKSPACE_COMPANY_ID?.trim() || DEFAULT_WORKSPACE;
  const category = process.env.DEBUG_INVOICE_CATEGORY?.trim() || DEFAULT_CATEGORY;
  const issueFrom = process.env.DEBUG_ISSUE_FROM?.trim() || DEFAULT_ISSUE_FROM;
  const issueTo = process.env.DEBUG_ISSUE_TO?.trim() || DEFAULT_ISSUE_TO;
  const dryRun = (process.env.DRY_RUN ?? "").trim() === "1";
  const pauseMs = envInt("PAUSE_MS", 800);
  const continueOnError = envBool("CONTINUE_ON_ERROR", true);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const invoices = await fetchOpenInvoicesJan2026(supabase, workspaceId, category, issueFrom, issueTo);
  const { groups, skipped_non_ccv1 } = buildClientGroups(invoices);

  console.log(
    JSON.stringify({
      tag: "debug_zeta_clientes_start",
      workspace_company_id: workspaceId,
      category,
      issue_from: issueFrom,
      issue_to: issueTo,
      invoice_rows_matched: invoices.length,
      distinct_clients: groups.length,
      skipped_invoice_rows_non_ccv1: skipped_non_ccv1,
      dry_run: dryRun,
    })
  );

  const perClient: PerClientResult[] = [];

  if (dryRun) {
    for (const g of groups) {
      const openBefore = await countOpenForCompany(
        supabase,
        workspaceId,
        g.proto_company_id,
        category,
        issueFrom,
        issueTo
      );
      perClient.push({
        cliente_codigo: g.cliente_codigo,
        proto_company_id: g.proto_company_id,
        open_before: openBefore,
        open_after: openBefore,
        pages_fetched: 0,
        rows_normalized: 0,
        rows_upserted: 0,
        stopped_reason: "skipped_dry_run",
        diagnosis: "DRY_RUN",
        sync_run_id: null,
        error_summary: null,
        pipeline_ok: null,
        sample_invoice_number: g.sample_invoice_number,
        open_invoice_rows_hint: g.open_invoice_rows,
      });
    }
  } else {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      const requestId = randomUUID();
      const openBefore = await countOpenForCompany(
        supabase,
        workspaceId,
        g.proto_company_id,
        category,
        issueFrom,
        issueTo
      );

      let result: ZetaSaldosPipelineResult | null = null;
      let threw = false;
      let throwMessage: string | null = null;

      try {
        result = await runZetaSaldosPendientesPipeline(supabase, workspaceId, requestId, {
          protoCompanyId: g.proto_company_id,
          clienteCodigo: g.cliente_codigo,
          mode: "incremental",
          idempotencyKey: `debug-zeta-clientes-${g.proto_company_id}-${g.cliente_codigo}-${Date.now()}`,
        });
      } catch (e) {
        threw = true;
        throwMessage = e instanceof Error ? e.message : String(e);
        console.error(
          JSON.stringify({
            tag: "debug_zeta_clientes_pipeline_throw",
            cliente_codigo: g.cliente_codigo,
            proto_company_id: g.proto_company_id,
            request_id: requestId,
            error: throwMessage,
          })
        );
        if (!continueOnError) process.exit(1);
      }

      const openAfter = await countOpenForCompany(
        supabase,
        workspaceId,
        g.proto_company_id,
        category,
        issueFrom,
        issueTo
      );

      const stopped: PerClientResult["stopped_reason"] = threw
        ? "exception"
        : (result?.stopped_reason ?? "aborted");

      const diagnosis = threw
        ? classifyDiagnosis({
            threw: true,
            stopped_reason: "exception",
            pages_fetched: result?.pages_fetched ?? 0,
            rows_normalized: result?.rows_normalized ?? 0,
            rows_upserted: result?.rows_upserted ?? 0,
          })
        : classifyDiagnosis({
            threw: false,
            stopped_reason: result!.stopped_reason,
            pages_fetched: result!.pages_fetched,
            rows_normalized: result!.rows_normalized,
            rows_upserted: result!.rows_upserted,
          });

      perClient.push({
        cliente_codigo: g.cliente_codigo,
        proto_company_id: g.proto_company_id,
        open_before: openBefore,
        open_after: openAfter,
        pages_fetched: result?.pages_fetched ?? 0,
        rows_normalized: result?.rows_normalized ?? 0,
        rows_upserted: result?.rows_upserted ?? 0,
        stopped_reason: stopped,
        diagnosis,
        sync_run_id: result?.sync_run_id ?? null,
        error_summary: threw ? throwMessage : (result?.error_summary ?? null),
        pipeline_ok: result?.ok ?? false,
        sample_invoice_number: g.sample_invoice_number,
        open_invoice_rows_hint: g.open_invoice_rows,
      });

      console.log(
        JSON.stringify({
          tag: "debug_zeta_clientes_client_done",
          cliente_codigo: g.cliente_codigo,
          proto_company_id: g.proto_company_id,
          request_id: requestId,
          open_before: openBefore,
          open_after: openAfter,
          pages_fetched: result?.pages_fetched ?? 0,
          rows_normalized: result?.rows_normalized ?? 0,
          rows_upserted: result?.rows_upserted ?? 0,
          stopped_reason: stopped,
          diagnosis,
          sync_run_id: result?.sync_run_id ?? null,
          pipeline_ok: result?.ok ?? false,
          error_summary: threw ? throwMessage : (result?.error_summary ?? null),
        })
      );

      if (i < groups.length - 1 && pauseMs > 0) await sleep(pauseMs);
    }
  }

  const counts: Record<string, number> = {};
  for (const row of perClient) {
    const d = row.diagnosis;
    counts[d] = (counts[d] ?? 0) + 1;
  }

  const summary = {
    total_clients: groups.length,
    ZETA_EMPTY: counts.ZETA_EMPTY ?? 0,
    MATCHING_PROBLEM: counts.MATCHING_PROBLEM ?? 0,
    PIPELINE_ERROR: counts.PIPELINE_ERROR ?? 0,
    UPDATED_OK: counts.UPDATED_OK ?? 0,
    UNKNOWN: counts.UNKNOWN ?? 0,
    ...(dryRun ? { DRY_RUN: counts.DRY_RUN ?? 0 } : {}),
    skipped_invoice_rows_non_ccv1: skipped_non_ccv1,
  };

  const detailList = perClient.map((r) => ({
    cliente_codigo: r.cliente_codigo,
    proto_company_id: r.proto_company_id,
    diagnosis: r.diagnosis,
  }));

  console.log(JSON.stringify({ tag: "debug_zeta_clientes_summary", ...summary }));
  console.log(JSON.stringify({ tag: "debug_zeta_clientes_detail", clients: detailList }));
  console.log(JSON.stringify({ tag: "debug_zeta_clientes_full", clients: perClient }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
