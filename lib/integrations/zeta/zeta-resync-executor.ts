/**
 * ZETA-14: Executor de re-sync jobs.
 *
 * Recibe un `ResyncJobRow` (ya en status=running), ejecuta el pipeline
 * correspondiente y devuelve un summary tipado.
 *
 * Reglas:
 * - NO modifica el estado del job (eso es responsabilidad del worker/caller).
 * - NO borra datos. Solo upsert idempotente vía pipelines existentes.
 * - Para invoices/receipts: llama pipelines por período (scope "period:YYYY-MM").
 * - Para installments/saldos: itera todos los clientes del workspace (no hay
 *   filtro por período en esos pipelines — Zeta devuelve saldos/cuotas activas).
 * - Scope inválido → error estructurado, nunca lanza excepción al caller.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResyncJobRow } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";
import {
  syncZetaCustomerVouchers,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-pipeline";
import {
  syncZetaCollectionReceipts,
} from "@/lib/integrations/zeta/zeta-collection-receipts-pipeline";
import {
  runZetaInstallmentsPipeline,
} from "@/lib/integrations/zeta/zeta-installments-pipeline";
import {
  runZetaSaldosPendientesPipeline,
} from "@/lib/integrations/zeta/zeta-saldos-pipeline";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResyncExecutorSummary = {
  rows_fetched: number;
  rows_upserted: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  rows_failed: number;
  duration_ms: number;
};

export type ResyncExecutorOutcome =
  | { ok: true; summary: ResyncExecutorSummary }
  | { ok: false; error: string; summary: ResyncExecutorSummary };

const EMPTY_SUMMARY = (duration_ms: number): ResyncExecutorSummary => ({
  rows_fetched: 0,
  rows_upserted: 0,
  rows_inserted: 0,
  rows_updated: 0,
  rows_skipped: 0,
  rows_failed: 0,
  duration_ms,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses "period:YYYY-MM" → { mes, anio } as strings (sin ceros líderes en mes).
 * Returns null for any other scope format.
 */
export function parsePeriodScope(scope: string): { mes: string; anio: string } | null {
  const match = /^period:(\d{4})-(\d{1,2})$/.exec(scope.trim());
  if (!match) return null;
  const anio = match[1]!;
  const mesNum = parseInt(match[2]!, 10);
  if (mesNum < 1 || mesNum > 12) return null;
  return { mes: String(mesNum), anio };
}

type WorkspaceClient = { id: string; Codigo: string };

async function getWorkspaceClients(
  supabase: SupabaseClient,
  workspaceId: string,
  cap = 500
): Promise<WorkspaceClient[]> {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id, Codigo")
    .eq("workspace_company_id", workspaceId)
    .eq("is_active", true)
    .not("Codigo", "is", null)
    .order("id", { ascending: true })
    .limit(cap);

  if (error) throw new Error(`proto_companies query failed: ${error.message}`);

  return ((data ?? []) as { id: string; Codigo: string | null }[])
    .filter((c) => typeof c.Codigo === "string" && c.Codigo.trim().length > 0)
    .map((c) => ({ id: c.id, Codigo: c.Codigo!.trim() }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Per-entity executors ──────────────────────────────────────────────────────

async function executeInvoicesResync(
  supabase: SupabaseClient,
  job: ResyncJobRow,
  started: number
): Promise<ResyncExecutorOutcome> {
  const period = parsePeriodScope(job.scope);
  if (!period) {
    return {
      ok: false,
      error: `Scope inválido para invoices: "${job.scope}". Esperado: "period:YYYY-MM"`,
      summary: EMPTY_SUMMARY(Date.now() - started),
    };
  }

  const ctx = { requestId: randomUUID(), tenantId: job.workspace_company_id };
  const result = await syncZetaCustomerVouchers({
    supabase,
    ctx,
    workspaceCompanyId: job.workspace_company_id,
    filters: { mes: period.mes, anio: period.anio },
  });

  const summary: ResyncExecutorSummary = {
    rows_fetched: result.zeta_rows_total ?? 0,
    rows_upserted: (result.inserted ?? 0) + (result.updated ?? 0),
    rows_inserted: result.inserted ?? 0,
    rows_updated: result.updated ?? 0,
    rows_skipped: result.skipped ?? 0,
    rows_failed: result.errors ?? 0,
    duration_ms: Date.now() - started,
  };

  if (!result.success) {
    return { ok: false, error: result.error ?? result.message ?? "syncZetaCustomerVouchers falló", summary };
  }
  return { ok: true, summary };
}

async function executeReceiptsResync(
  supabase: SupabaseClient,
  job: ResyncJobRow,
  started: number
): Promise<ResyncExecutorOutcome> {
  const period = parsePeriodScope(job.scope);
  if (!period) {
    return {
      ok: false,
      error: `Scope inválido para receipts: "${job.scope}". Esperado: "period:YYYY-MM"`,
      summary: EMPTY_SUMMARY(Date.now() - started),
    };
  }

  const ctx = { requestId: randomUUID(), tenantId: job.workspace_company_id };
  const result = await syncZetaCollectionReceipts({
    supabase,
    ctx,
    workspaceCompanyId: job.workspace_company_id,
    filters: { mes: period.mes, anio: period.anio },
  });

  const summary: ResyncExecutorSummary = {
    rows_fetched: result.processed ?? 0,
    rows_upserted: (result.inserted ?? 0) + (result.updated ?? 0),
    rows_inserted: result.inserted ?? 0,
    rows_updated: result.updated ?? 0,
    rows_skipped: result.skipped ?? 0,
    rows_failed: result.errors ?? 0,
    duration_ms: Date.now() - started,
  };

  if (!result.success) {
    return { ok: false, error: result.message ?? "syncZetaCollectionReceipts falló", summary };
  }
  return { ok: true, summary };
}

async function executeInstallmentsResync(
  supabase: SupabaseClient,
  job: ResyncJobRow,
  started: number
): Promise<ResyncExecutorOutcome> {
  let clients: WorkspaceClient[];
  try {
    clients = await getWorkspaceClients(supabase, job.workspace_company_id);
  } catch (e) {
    return { ok: false, error: String(e), summary: EMPTY_SUMMARY(Date.now() - started) };
  }

  if (clients.length === 0) {
    return { ok: true, summary: EMPTY_SUMMARY(Date.now() - started) };
  }

  let totalFetched = 0;
  let totalUpserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]!;
    if (i > 0) await sleep(600);
    try {
      const result = await runZetaInstallmentsPipeline(
        supabase,
        job.workspace_company_id,
        randomUUID(),
        {
          clienteCodigo: client.Codigo,
          maxPagesPerRun: 5,
          pageDelayMs: 400,
          updateInvoiceDueDate: true,
        }
      );
      totalFetched += result.rows_fetched;
      totalUpserted += result.rows_upserted;
      if (result.stopped_reason === "fetch_error" || result.stopped_reason === "upsert_error") {
        totalErrors++;
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          source: "zeta-resync-executor",
          kind: "installments_client_error",
          job_id: job.id,
          cliente_codigo: client.Codigo,
          error: String(e),
        })
      );
      totalErrors++;
    }
  }

  const summary: ResyncExecutorSummary = {
    rows_fetched: totalFetched,
    rows_upserted: totalUpserted,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    rows_failed: totalErrors,
    duration_ms: Date.now() - started,
  };

  // Partial success: at least one client succeeded
  const ok = totalErrors < clients.length;
  if (!ok) {
    return { ok: false, error: `Todos los clientes fallaron (${totalErrors}/${clients.length})`, summary };
  }
  return { ok: true, summary };
}

async function executeSaldosResync(
  supabase: SupabaseClient,
  job: ResyncJobRow,
  started: number
): Promise<ResyncExecutorOutcome> {
  let clients: WorkspaceClient[];
  try {
    clients = await getWorkspaceClients(supabase, job.workspace_company_id);
  } catch (e) {
    return { ok: false, error: String(e), summary: EMPTY_SUMMARY(Date.now() - started) };
  }

  if (clients.length === 0) {
    return { ok: true, summary: EMPTY_SUMMARY(Date.now() - started) };
  }

  let totalUpserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]!;
    if (i > 0) await sleep(600);
    try {
      const result = await runZetaSaldosPendientesPipeline(
        supabase,
        job.workspace_company_id,
        randomUUID(),
        {
          protoCompanyId: client.id,
          clienteCodigo: client.Codigo,
          mode: "incremental",
          maxPagesPerRun: 5,
          pageDelayMs: 400,
        }
      );
      totalUpserted += result.rows_upserted;
      if (!result.ok) totalErrors++;
    } catch (e) {
      console.error(
        JSON.stringify({
          source: "zeta-resync-executor",
          kind: "saldos_client_error",
          job_id: job.id,
          cliente_codigo: client.Codigo,
          error: String(e),
        })
      );
      totalErrors++;
    }
  }

  const summary: ResyncExecutorSummary = {
    rows_fetched: 0,
    rows_upserted: totalUpserted,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    rows_failed: totalErrors,
    duration_ms: Date.now() - started,
  };

  const ok = totalErrors < clients.length;
  if (!ok) {
    return { ok: false, error: `Todos los clientes fallaron (${totalErrors}/${clients.length})`, summary };
  }
  return { ok: true, summary };
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Ejecuta el pipeline correspondiente al job.
 * Nunca lanza excepción al caller — siempre devuelve un outcome tipado.
 */
export async function executeResyncJob(
  supabase: SupabaseClient,
  job: ResyncJobRow
): Promise<ResyncExecutorOutcome> {
  const started = Date.now();

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "zeta-resync-executor",
      kind: "job_start",
      job_id: job.id,
      entity: job.entity,
      scope: job.scope,
      workspace_company_id: job.workspace_company_id,
      triggered_by: job.triggered_by,
    })
  );

  try {
    let outcome: ResyncExecutorOutcome;

    switch (job.entity) {
      case "invoices":
        outcome = await executeInvoicesResync(supabase, job, started);
        break;
      case "receipts":
        outcome = await executeReceiptsResync(supabase, job, started);
        break;
      case "installments":
        outcome = await executeInstallmentsResync(supabase, job, started);
        break;
      case "saldos":
        outcome = await executeSaldosResync(supabase, job, started);
        break;
      default:
        outcome = {
          ok: false,
          error: `Entidad "${job.entity}" no soportada por el executor. Usar scripts manuales.`,
          summary: EMPTY_SUMMARY(Date.now() - started),
        };
    }

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta-resync-executor",
        kind: "job_end",
        job_id: job.id,
        entity: job.entity,
        ok: outcome.ok,
        ...("error" in outcome ? { error: outcome.error } : {}),
        summary: outcome.summary,
      })
    );

    return outcome;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta-resync-executor",
        kind: "job_exception",
        job_id: job.id,
        entity: job.entity,
        error: msg,
      })
    );
    return {
      ok: false,
      error: `Excepción no controlada: ${msg}`,
      summary: EMPTY_SUMMARY(Date.now() - started),
    };
  }
}
