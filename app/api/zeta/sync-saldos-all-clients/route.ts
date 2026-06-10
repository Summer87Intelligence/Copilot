/**
 * POST /api/zeta/sync-saldos-all-clients
 *
 * Sincroniza saldos pendientes de Zeta para TODOS los clientes del tenant
 * que tengan un código Zeta (`external_id`) registrado en `proto_companies`.
 *
 * Diseñado para ser llamado:
 *  - Manualmente desde el panel de admin.
 *  - Desde el cron endpoint `/api/cron/sync-saldos` (usa service_role internamente).
 *
 * Rate limiting: delay de 400ms entre clientes para respetar límites de Zeta.
 * Timeout: procesa hasta `max_clients` por invocación (default: 20).
 *
 * Respuesta: resumen por cliente con status y métricas.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireZetaCopilotAuth } from "@/lib/integrations/zeta/zeta-api-auth";
import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";

// `max_clients` define cuántos clientes activos con `Codigo` se sincronizan en
// una sola invocación. Para tenants con muchos clientes (Summer87 = 183 al
// 2026-05-11), el techo previo de 50 dejaba la mayoría sin sync y producía
// `balance_amount=0` en facturas con saldo pendiente real. Subimos el techo a
// 500 y el default a 100. Los clientes se procesan secuencialmente respetando
// `client_delay_ms` para no romper el rate limit de Zeta.
const bodySchema = z
  .object({
    mode: z.enum(["bootstrap", "incremental"]).default("incremental"),
    max_clients: z.number().int().min(1).max(500).default(100),
    max_pages_per_client: z.number().int().min(1).max(20).default(5),
    page_delay_ms: z.number().int().min(100).max(2000).default(400),
    client_delay_ms: z.number().int().min(200).max(5000).default(600),
  })
  .strict();

type ClientSyncResult = {
  proto_company_id: string;
  cliente_codigo: string;
  status: "ok" | "partial" | "error" | "skipped";
  rows_normalized: number;
  rows_upserted: number;
  pages_fetched: number;
  stopped_reason?: string;
  error?: string;
  duration_ms: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  const pv = await parseAndValidateJsonBody(request, bodySchema);
  if (!pv.ok) return pv.response;

  const auth = await requireZetaCopilotAuth(request, pv.data as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const body = pv.data;
  const { supabase, tenantCompanyId } = auth.ctx;
  const wid = tenantCompanyId.trim();
  const batchId = randomUUID();
  const started = Date.now();

  // 1. Cargar todos los clientes con código Zeta en este workspace.
  // La columna en proto_companies es "Codigo" (case-sensitive) — no "external_id".
  // Orden determinístico por `id` para reproducibilidad y para que dos corridas
  // sucesivas seleccionen el mismo subconjunto cuando `max_clients` esté por
  // debajo del universo total (idéntico criterio que el cron).
  const { data: companies, error: compErr } = await supabase
    .from("proto_companies")
    .select("id, Codigo, name")
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .not("Codigo", "is", null)
    .order("id", { ascending: true })
    .limit(body.max_clients ?? 100);

  if (compErr) {
    return NextResponse.json(
      {
        ok: false,
        batch_id: batchId,
        code: "DB_ERROR",
        message: "Error al cargar clientes: " + compErr.message,
      },
      { status: 500 }
    );
  }

  const clientRows = (companies ?? []) as {
    id: string;
    Codigo: string | null;
    name: string | null;
  }[];

  const eligible = clientRows.filter(
    (r) => typeof r.Codigo === "string" && r.Codigo.trim().length > 0
  );

  if (eligible.length === 0) {
    return NextResponse.json({
      ok: true,
      batch_id: batchId,
      code: "NO_ELIGIBLE_CLIENTS",
      message: "No hay clientes con código Zeta registrado.",
      results: [],
      duration_ms: Date.now() - started,
    });
  }

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "sync_saldos_all_clients",
      kind: "batch_start",
      batch_id: batchId,
      tenant_id: wid,
      eligible_clients: eligible.length,
      mode: body.mode,
      max_pages_per_client: body.max_pages_per_client,
    })
  );

  // 2. Procesar cada cliente secuencialmente
  const results: ClientSyncResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < eligible.length; i++) {
    const company = eligible[i]!;
    const clienteCodigo = company.Codigo!.trim();
    const clientStarted = Date.now();

    if (i > 0) {
      await sleep(body.client_delay_ms ?? 600);
    }

    const requestId = randomUUID();
    let result: ClientSyncResult;

    try {
      const pipelineResult = await runZetaSaldosPendientesPipeline(
        supabase,
        wid,
        requestId,
        {
          protoCompanyId: company.id,
          clienteCodigo,
          mode: (body.mode ?? "incremental") as "bootstrap" | "incremental",
          maxPagesPerRun: body.max_pages_per_client ?? 5,
          pageDelayMs: body.page_delay_ms ?? 400,
        }
      );

      const status =
        pipelineResult.stopped_reason === "completed"
          ? "ok"
          : pipelineResult.stopped_reason === "max_pages"
            ? "partial"
            : "error";

      if (status === "ok" || status === "partial") successCount++;
      else errorCount++;

      result = {
        proto_company_id: company.id,
        cliente_codigo: clienteCodigo,
        status,
        rows_normalized: pipelineResult.rows_normalized,
        rows_upserted: pipelineResult.rows_upserted,
        pages_fetched: pipelineResult.pages_fetched,
        stopped_reason: pipelineResult.stopped_reason,
        ...(pipelineResult.error_summary
          ? { error: pipelineResult.error_summary }
          : {}),
        duration_ms: Date.now() - clientStarted,
      };
    } catch (e) {
      errorCount++;
      result = {
        proto_company_id: company.id,
        cliente_codigo: clienteCodigo,
        status: "error",
        rows_normalized: 0,
        rows_upserted: 0,
        pages_fetched: 0,
        error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        duration_ms: Date.now() - clientStarted,
      };
    }

    results.push(result);

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "sync_saldos_all_clients",
        kind: "client_done",
        batch_id: batchId,
        tenant_id: wid,
        proto_company_id: company.id,
        cliente_codigo: clienteCodigo,
        status: result.status,
        rows_upserted: result.rows_upserted,
        duration_ms: result.duration_ms,
        progress: `${i + 1}/${eligible.length}`,
      })
    );
  }

  const totalDuration = Date.now() - started;

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "sync_saldos_all_clients",
      kind: "batch_end",
      batch_id: batchId,
      tenant_id: wid,
      total_clients: eligible.length,
      success_count: successCount,
      error_count: errorCount,
      duration_ms: totalDuration,
    })
  );

  return NextResponse.json({
    ok: errorCount === 0,
    batch_id: batchId,
    total_clients: eligible.length,
    success_count: successCount,
    error_count: errorCount,
    duration_ms: totalDuration,
    results,
  });
}
