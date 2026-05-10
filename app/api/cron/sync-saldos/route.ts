/**
 * GET /api/cron/sync-saldos
 *
 * Endpoint para cron de Vercel — sincroniza saldos pendientes de todos los tenants activos.
 *
 * Autenticación: Vercel envía automáticamente el header `Authorization: Bearer <CRON_SECRET>`
 * cuando ejecuta el cron. La validación usa `process.env.CRON_SECRET`.
 *
 * Configurado en vercel.json:
 *   schedule: "0 [asterisco]/6 [asterisco] [asterisco] [asterisco]" = cada 6 horas
 *
 * Limitaciones de Vercel:
 *   - Hobby plan: 1 cron job, timeout 60s.
 *   - Pro plan: múltiples crons, timeout 300s.
 *
 * Estrategia para múltiples tenants:
 *   - Itera todos los workspaces (companies) activos.
 *   - Para cada workspace, procesa hasta MAX_CLIENTS_PER_WORKSPACE clientes.
 *   - Si hay más clientes, el próximo cron continúa (watermark por workspace).
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";

const MAX_CLIENTS_PER_WORKSPACE = 10;
const PAGE_DELAY_MS = 400;
const CLIENT_DELAY_MS = 600;
const MAX_PAGES_PER_CLIENT = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { ok: false, code: "CONFIG_ERROR", message: "Supabase config faltante." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const cronRunId = randomUUID();
  const started = Date.now();

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "cron_sync_saldos",
      kind: "cron_start",
      cron_run_id: cronRunId,
    })
  );

  // 1. Cargar todos los workspaces activos (companies tabla pública)
  const { data: workspaces, error: wsErr } = await supabase
    .from("companies")
    .select("id")
    .eq("status", "active")
    .limit(20);

  if (wsErr) {
    console.error(
      JSON.stringify({
        source: "cron_sync_saldos",
        kind: "workspace_load_error",
        error: wsErr.message,
      })
    );
    return NextResponse.json(
      { ok: false, code: "DB_ERROR", message: wsErr.message },
      { status: 500 }
    );
  }

  const workspaceIds = ((workspaces ?? []) as { id: string }[]).map((w) => w.id);

  let totalClients = 0;
  let totalUpserted = 0;
  let totalErrors = 0;
  const workspaceSummaries: { workspace_id: string; clients: number; errors: number }[] = [];

  // 2. Procesar cada workspace
  for (const workspaceId of workspaceIds) {
    const { data: companies, error: compErr } = await supabase
      .from("proto_companies")
      .select("id, Codigo")
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true)
      .not("Codigo", "is", null)
      .limit(MAX_CLIENTS_PER_WORKSPACE);

    if (compErr) {
      console.error(
        JSON.stringify({
          source: "cron_sync_saldos",
          kind: "companies_load_error",
          workspace_id: workspaceId,
          error: compErr.message,
        })
      );
      totalErrors++;
      continue;
    }

    const eligible = ((companies ?? []) as { id: string; Codigo: string | null }[]).filter(
      (c) => c.Codigo?.trim()
    );

    let wsErrors = 0;

    for (let i = 0; i < eligible.length; i++) {
      const company = eligible[i]!;
      if (i > 0) await sleep(CLIENT_DELAY_MS);

      try {
        const pipelineResult = await runZetaSaldosPendientesPipeline(
          supabase,
          workspaceId,
          randomUUID(),
          {
            protoCompanyId: company.id,
            clienteCodigo: company.Codigo!.trim(),
            mode: "incremental",
            maxPagesPerRun: MAX_PAGES_PER_CLIENT,
            pageDelayMs: PAGE_DELAY_MS,
          }
        );
        totalUpserted += pipelineResult.rows_upserted;
        if (pipelineResult.stopped_reason !== "completed" && pipelineResult.stopped_reason !== "max_pages") {
          wsErrors++;
          totalErrors++;
        }
      } catch {
        wsErrors++;
        totalErrors++;
      }

      totalClients++;
    }

    workspaceSummaries.push({
      workspace_id: workspaceId,
      clients: eligible.length,
      errors: wsErrors,
    });
  }

  const duration = Date.now() - started;

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "cron_sync_saldos",
      kind: "cron_end",
      cron_run_id: cronRunId,
      workspaces: workspaceIds.length,
      total_clients: totalClients,
      total_upserted: totalUpserted,
      total_errors: totalErrors,
      duration_ms: duration,
    })
  );

  return NextResponse.json({
    ok: totalErrors === 0,
    cron_run_id: cronRunId,
    workspaces_processed: workspaceIds.length,
    total_clients: totalClients,
    total_upserted: totalUpserted,
    total_errors: totalErrors,
    duration_ms: duration,
    workspace_summaries: workspaceSummaries,
  });
}
