import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { zetaSyncSaldosPendientesBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";
import type { ZetaSaldosPipelineResult } from "@/lib/integrations/zeta/zeta-pipeline-types";

type ZetaSaldosPublicResponse = {
  ok: boolean;
  request_id: string;
  /** Código estable para clientes; detalle técnico solo en logs server-side. */
  code: string;
  message: string;
  sync_run_id: string;
  pages_fetched: number;
  rows_normalized: number;
  rows_upserted: number;
  stopped_reason: ZetaSaldosPipelineResult["stopped_reason"];
  last_page_processed: string;
  bootstrap_completed: boolean;
};

function buildPublicZetaSaldosResponse(
  requestId: string,
  result: ZetaSaldosPipelineResult
): ZetaSaldosPublicResponse {
  const { ok, stopped_reason } = result;

  let code: string;
  let message: string;

  if (ok && stopped_reason === "completed") {
    code = "ZETA_SYNC_OK";
    message = "Sincronización completada.";
  } else if (ok && stopped_reason === "max_pages") {
    code = "ZETA_SYNC_PARTIAL_PAGES";
    message =
      "Se alcanzó el límite de páginas por corrida; ejecutá de nuevo para continuar la importación.";
  } else if (!ok && stopped_reason === "zeta_error") {
    code = "ZETA_PROVIDER_ERROR";
    message = "La consulta a Zeta no pudo completarse. Reintentá más tarde o revisá la conexión.";
  } else if (!ok && stopped_reason === "persist_error") {
    code = "ZETA_PERSIST_ERROR";
    message = "No se pudieron guardar los datos en Copilot. Revisá los logs del servidor.";
  } else {
    code = "ZETA_SYNC_FAILED";
    message = "La sincronización no pudo completarse. Revisá los logs del servidor.";
  }

  return {
    ok,
    request_id: requestId,
    code,
    message,
    sync_run_id: result.sync_run_id,
    pages_fetched: result.pages_fetched,
    rows_normalized: result.rows_normalized,
    rows_upserted: result.rows_upserted,
    stopped_reason: result.stopped_reason,
    last_page_processed: result.last_page_processed,
    bootstrap_completed: result.bootstrap_completed,
  };
}

/**
 * POST — pipeline batch Zeta (saldos pendientes por cliente + paginación acotada).
 * No sustituye consultas interactivas del producto: solo ingesta / sync server-side.
 */
export async function POST(request: NextRequest) {
  const pv = await parseAndValidateJsonBody(request, zetaSyncSaldosPendientesBodySchema);
  if (!pv.ok) return pv.response;

  const auth = await requireCopilotTenantContext(request, pv.data as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const body = pv.data;
  const requestId = randomUUID();

  try {
    const result = await runZetaSaldosPendientesPipeline(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      requestId,
      {
        protoCompanyId: body.proto_company_id,
        clienteCodigo: body.cliente_codigo,
        mode: body.mode,
        maxPagesPerRun: body.max_pages_per_run,
        pageDelayMs: body.page_delay_ms,
        overlapSeconds: body.overlap_seconds,
        idempotencyKey: body.idempotency_key ?? null,
      }
    );

    const publicBody = buildPublicZetaSaldosResponse(requestId, result);
    return NextResponse.json(publicBody, { status: publicBody.ok ? 200 : 422 });
  } catch {
    return NextResponse.json(
      {
        ok: false as const,
        request_id: requestId,
        code: "ZETA_PIPELINE_FATAL",
        message: "Error interno al ejecutar la sincronización. Revisá los logs del servidor.",
        sync_run_id: "",
        pages_fetched: 0,
        rows_normalized: 0,
        rows_upserted: 0,
        stopped_reason: "aborted" as const,
        last_page_processed: "",
        bootstrap_completed: false,
      },
      { status: 500 }
    );
  }
}
