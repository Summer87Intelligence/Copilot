/**
 * POST /api/zeta/resync
 *
 * ZETA-14 — Re-sincronización inteligente y segura por entidad, período o cliente.
 * Permite corregir gaps detectados por el completeness audit sin tocar datos manualmente.
 *
 * Body esperado:
 * {
 *   "entity": "invoices" | "receipts" | "installments" | "saldos",
 *   "scope": "period:2026-05",
 *   "mes": 5,            // requerido para invoices/receipts
 *   "anio": 2026,        // requerido para invoices/receipts
 *   "dry_run": false,
 *   "reason": "manual fix"  // opcional, para auditoría
 * }
 *
 * Protecciones:
 * - Autenticación de tenant via requireZetaCopilotAuth()
 * - Idempotente: re-ejecutar para el mismo período no duplica datos
 * - dry_run: registra job pero no ejecuta sync
 * - Nunca modifica datos en Zeta (solo read)
 *
 * invoices/receipts: ejecutados inline (retorna resultado inmediato).
 * installments/saldos: job creado + encolado (procesado por zeta-resync-worker cron).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireZetaCopilotAuth } from "@/lib/integrations/zeta/zeta-api-auth";
import {
  createResyncJob,
  updateResyncJob,
} from "@/lib/data/zeta-enterprise-sync-repository";
import { syncZetaCustomerVouchers } from "@/lib/integrations/zeta/zeta-customer-vouchers-pipeline";
import { syncZetaCollectionReceipts } from "@/lib/integrations/zeta/zeta-collection-receipts-pipeline";

const bodySchema = z
  .object({
    entity: z.enum(["invoices", "receipts", "installments", "saldos", "contacts"]),
    scope: z.string().trim().min(1).max(64),
    mes: z.coerce.number().int().min(1).max(12).optional(),
    anio: z.coerce.number().int().min(2026).max(2100).optional(),
    dry_run: z.boolean().optional().default(false),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

/** Entities processed inline (synchronous HTTP response). */
const INLINE_ENTITIES = new Set(["invoices", "receipts"]);
/** Entities queued for async worker processing. */
const QUEUED_ENTITIES = new Set(["installments", "saldos"]);

export async function POST(request: NextRequest) {
  // ── Parse + validate body ────────────────────────────────────────────────
  const pv = await parseAndValidateJsonBody(request, bodySchema);
  if (!pv.ok) return pv.response;

  // ── Auth + tenant context ─────────────────────────────────────────────────
  const auth = await requireZetaCopilotAuth(request, pv.data as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const workspaceId = auth.ctx.tenantCompanyId?.trim();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, code: "TENANT_MISSING" }, { status: 403 });
  }

  const { entity, scope, mes, anio, dry_run, reason } = pv.data;
  const supabase = auth.ctx.supabase;

  // ── Validar mes/anio para entidades que los necesitan ──────────────────────
  if (INLINE_ENTITIES.has(entity) && (mes == null || anio == null)) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "mes y anio son obligatorios para invoices/receipts." },
      { status: 400 }
    );
  }

  // ── Crear job ─────────────────────────────────────────────────────────────
  const job = await createResyncJob(supabase, {
    workspace_company_id: workspaceId,
    entity,
    scope,
    triggered_by: "manual",
    dry_run,
    metadata: { mes: mes ?? null, anio: anio ?? null, reason: reason ?? null },
  });

  if (!job) {
    return NextResponse.json({ ok: false, code: "JOB_CREATE_FAILED" }, { status: 500 });
  }

  if (dry_run) {
    return NextResponse.json({
      ok: true,
      job_id: job.id,
      dry_run: true,
      entity,
      scope,
      message: "Dry run: job registrado, sync no ejecutado.",
    });
  }

  // ── Ejecutar sync ─────────────────────────────────────────────────────────
  await updateResyncJob(supabase, job.id, {
    status: "running",
    started_at: new Date().toISOString(),
  });

  const ctx = { requestId: randomUUID(), tenantId: workspaceId };
  const started = Date.now();

  try {
    if (entity === "invoices") {
      const result = await syncZetaCustomerVouchers({
        supabase,
        ctx,
        workspaceCompanyId: workspaceId,
        filters: { mes: String(mes), anio: String(anio) },
      });

      await updateResyncJob(supabase, job.id, {
        status: result.success ? "completed" : "failed",
        completed_at: new Date().toISOString(),
        rows_fetched: result.zeta_rows_total ?? 0,
        rows_synced: (result.inserted ?? 0) + (result.updated ?? 0),
        rows_skipped: result.skipped ?? 0,
        error_summary: result.error ?? undefined,
      });

      return NextResponse.json({
        ok: result.success,
        job_id: job.id,
        entity,
        scope,
        duration_ms: Date.now() - started,
        rows_fetched: result.zeta_rows_total ?? 0,
        rows_synced: (result.inserted ?? 0) + (result.updated ?? 0),
        rows_skipped: result.skipped ?? 0,
        error: result.error ?? null,
      });
    }

    if (entity === "receipts") {
      const result = await syncZetaCollectionReceipts({
        supabase,
        ctx,
        workspaceCompanyId: workspaceId,
        filters: { mes: String(mes), anio: String(anio) },
      });

      await updateResyncJob(supabase, job.id, {
        status: result.success ? "completed" : "failed",
        completed_at: new Date().toISOString(),
        rows_fetched: result.processed ?? 0,
        rows_synced: (result.inserted ?? 0) + (result.updated ?? 0),
        rows_skipped: result.skipped ?? 0,
        error_summary: result.message ?? undefined,
      });

      return NextResponse.json({
        ok: result.success,
        job_id: job.id,
        entity,
        scope,
        duration_ms: Date.now() - started,
        rows_fetched: result.processed ?? 0,
        rows_synced: (result.inserted ?? 0) + (result.updated ?? 0),
        rows_skipped: result.skipped ?? 0,
        error: result.message ?? null,
      });
    }

    // Entidades asíncronas: job encolado, procesado por zeta-resync-worker
    if (QUEUED_ENTITIES.has(entity)) {
      return NextResponse.json({
        ok: true,
        queued: true,
        job_id: job.id,
        entity,
        scope,
        message: `Job de ${entity} encolado. Será procesado por el worker zeta-resync-worker (cada 30min).`,
      });
    }

    // Entidades no implementadas
    await updateResyncJob(supabase, job.id, {
      status: "skipped",
      completed_at: new Date().toISOString(),
      error_summary: `Re-sync de "${entity}" no disponible por API.`,
    });

    return NextResponse.json({
      ok: false,
      code: "NOT_IMPLEMENTED",
      job_id: job.id,
      message: `Re-sync de "${entity}" no disponible vía API.`,
    }, { status: 422 });

  } catch (err) {
    const msg = String(err);
    await updateResyncJob(supabase, job.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error_summary: msg,
    }).catch(() => {});

    return NextResponse.json(
      { ok: false, code: "SYNC_ERROR", job_id: job.id, message: msg },
      { status: 500 }
    );
  }
}
