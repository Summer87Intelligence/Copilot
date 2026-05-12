/**
 * POST /api/zeta/sync-installments-backfill
 *
 * Backfill manual de `proto_invoice_installments` para un workspace.
 *
 * Diferencia con `/api/cron/zeta-sync-cuotas`:
 *  - El cron procesa TODOS los workspaces y aplica anti-overlap a nivel global.
 *  - Este endpoint procesa UN solo workspace y permite filtrar clientes.
 *
 * Auth: Bearer CRON_SECRET (mismo patrón que cron — no requiere login web,
 * pero exige el secret de servidor; se invoca desde scripts de operador).
 *
 * Body JSON:
 *  - `workspaceCompanyId` (required, string uuid).
 *  - `clienteCodigos` (optional, string[]) — si presente, solo procesa esos.
 *  - `maxClients` (optional, number) — cap de clientes a procesar; default 50.
 *  - `updateInvoiceDueDate` (optional, boolean) — default true.
 *  - `pageDelayMs` (optional, number) — default 400.
 *  - `clientDelayMs` (optional, number) — default 600.
 *  - `maxPagesPerClient` (optional, number) — default 5.
 *  - `dryRun` (optional, boolean) — si true, valida payload pero no llama Zeta.
 *
 * Response: estructura idéntica al cron (con `workspace_summary` único).
 *
 * NO toca:
 *  - Saldos.
 *  - Vouchers.
 *  - balance_amount de invoices.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runZetaInstallmentsPipeline } from "@/lib/integrations/zeta/zeta-installments-pipeline";
import { withZetaRetry } from "@/lib/integrations/zeta/zeta-retry";

const DEFAULT_MAX_CLIENTS = 50;
const DEFAULT_PAGE_DELAY_MS = 400;
const DEFAULT_CLIENT_DELAY_MS = 600;
const DEFAULT_MAX_PAGES = 5;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type BackfillBody = {
  workspaceCompanyId?: string;
  clienteCodigos?: string[];
  maxClients?: number;
  updateInvoiceDueDate?: boolean;
  pageDelayMs?: number;
  clientDelayMs?: number;
  maxPagesPerClient?: number;
  dryRun?: boolean;
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: BackfillBody;
  try {
    body = (await request.json()) as BackfillBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", message: "JSON inválido." },
      { status: 400 }
    );
  }

  const workspaceCompanyId = body.workspaceCompanyId?.trim();
  if (!workspaceCompanyId) {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", message: "workspaceCompanyId requerido." },
      { status: 400 }
    );
  }

  const maxClients =
    typeof body.maxClients === "number" && body.maxClients > 0
      ? Math.floor(body.maxClients)
      : DEFAULT_MAX_CLIENTS;
  const pageDelayMs =
    typeof body.pageDelayMs === "number" && body.pageDelayMs >= 0
      ? body.pageDelayMs
      : DEFAULT_PAGE_DELAY_MS;
  const clientDelayMs =
    typeof body.clientDelayMs === "number" && body.clientDelayMs >= 0
      ? body.clientDelayMs
      : DEFAULT_CLIENT_DELAY_MS;
  const maxPagesPerClient =
    typeof body.maxPagesPerClient === "number" && body.maxPagesPerClient > 0
      ? Math.floor(body.maxPagesPerClient)
      : DEFAULT_MAX_PAGES;
  const updateInvoiceDueDate = body.updateInvoiceDueDate !== false;
  const dryRun = body.dryRun === true;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { ok: false, code: "CONFIG_ERROR", message: "Supabase config faltante." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const backfillRunId = randomUUID();
  const started = Date.now();

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "zeta_installments_backfill",
      kind: "backfill_start",
      backfill_run_id: backfillRunId,
      workspace_company_id: workspaceCompanyId,
      dry_run: dryRun,
    })
  );

  let companyQuery = supabase
    .from("proto_companies")
    .select("id, Codigo, name")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("is_active", true)
    .not("Codigo", "is", null)
    .order("id", { ascending: true });

  const filterCodigos = (body.clienteCodigos ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);

  if (filterCodigos.length > 0) {
    companyQuery = companyQuery.in("Codigo", filterCodigos);
  }
  companyQuery = companyQuery.limit(maxClients);

  const { data: companies, error: compErr } = await companyQuery;
  if (compErr) {
    return NextResponse.json(
      { ok: false, code: "DB_ERROR", message: compErr.message },
      { status: 500 }
    );
  }

  const eligible = ((companies ?? []) as Array<{ id: string; Codigo: string | null; name: string | null }>)
    .filter((c) => c.Codigo?.trim());

  const clientResults: Array<{
    proto_company_id: string;
    cliente_codigo: string;
    company_name: string | null;
    rows_fetched: number;
    rows_upserted: number;
    rows_linked: number;
    rows_orphan: number;
    invoices_due_date_updated: number;
    stopped_reason: string;
    errors: string[];
    warnings: string[];
  }> = [];

  let totalUpserted = 0;
  let totalLinked = 0;
  let totalOrphan = 0;
  let totalDueDateUpdated = 0;
  let totalFailed = 0;

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      backfill_run_id: backfillRunId,
      workspace_company_id: workspaceCompanyId,
      eligible_clients: eligible.length,
      sample: eligible.slice(0, 10).map((c) => ({
        proto_company_id: c.id,
        cliente_codigo: c.Codigo,
        company_name: c.name,
      })),
      filters_applied: {
        cliente_codigos: filterCodigos.length > 0 ? filterCodigos : null,
        max_clients: maxClients,
      },
    });
  }

  for (let i = 0; i < eligible.length; i++) {
    const company = eligible[i]!;
    if (i > 0) await sleep(clientDelayMs);

    const clienteCodigo = company.Codigo!.trim();

    try {
      const result = await withZetaRetry(
        () =>
          runZetaInstallmentsPipeline(supabase, workspaceCompanyId, randomUUID(), {
            clienteCodigo,
            maxPagesPerRun: maxPagesPerClient,
            pageDelayMs,
            updateInvoiceDueDate,
          }),
        {
          maxRetries: 3,
          baseDelayMs: 1_000,
          maxDelayMs: 10_000,
        }
      );

      totalUpserted += result.rows_upserted;
      totalLinked += result.rows_linked;
      totalOrphan += result.rows_orphan;
      totalDueDateUpdated += result.invoices_due_date_updated;

      if (
        result.stopped_reason !== "completed" &&
        result.stopped_reason !== "max_pages"
      ) {
        totalFailed++;
      }

      clientResults.push({
        proto_company_id: company.id,
        cliente_codigo: clienteCodigo,
        company_name: company.name,
        rows_fetched: result.rows_fetched,
        rows_upserted: result.rows_upserted,
        rows_linked: result.rows_linked,
        rows_orphan: result.rows_orphan,
        invoices_due_date_updated: result.invoices_due_date_updated,
        stopped_reason: result.stopped_reason,
        errors: result.errors,
        warnings: result.warnings,
      });
    } catch (err) {
      totalFailed++;
      clientResults.push({
        proto_company_id: company.id,
        cliente_codigo: clienteCodigo,
        company_name: company.name,
        rows_fetched: 0,
        rows_upserted: 0,
        rows_linked: 0,
        rows_orphan: 0,
        invoices_due_date_updated: 0,
        stopped_reason: "fetch_error",
        errors: [String(err)],
        warnings: [],
      });
    }
  }

  const duration = Date.now() - started;
  const finalStatus =
    totalFailed === 0 ? "succeeded" : totalUpserted > 0 ? "partial" : "failed";

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "zeta_installments_backfill",
      kind: "backfill_end",
      backfill_run_id: backfillRunId,
      workspace_company_id: workspaceCompanyId,
      clients_processed: eligible.length,
      total_upserted: totalUpserted,
      total_linked: totalLinked,
      total_orphan: totalOrphan,
      invoices_due_date_updated: totalDueDateUpdated,
      total_failed: totalFailed,
      status: finalStatus,
      duration_ms: duration,
    })
  );

  return NextResponse.json({
    ok: totalFailed === 0,
    status: finalStatus,
    backfill_run_id: backfillRunId,
    workspace_company_id: workspaceCompanyId,
    clients_processed: eligible.length,
    total_upserted: totalUpserted,
    total_linked: totalLinked,
    total_orphan: totalOrphan,
    invoices_due_date_updated: totalDueDateUpdated,
    total_failed: totalFailed,
    duration_ms: duration,
    client_results: clientResults,
  });
}
