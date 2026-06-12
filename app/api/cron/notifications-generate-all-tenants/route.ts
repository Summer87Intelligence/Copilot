/**
 * GET /api/cron/notifications-generate-all-tenants
 *
 * Genera notificaciones operacionales para todos los workspaces activos.
 * Multi-tenant. Anti-overlap por workspace vía dedup_key en createNotificationIfNotExists.
 * Timeout-safe (≤50s por run). Errores por tenant no abortan al resto.
 *
 * Auth: Bearer CRON_SECRET (mismo patrón que zeta-sync-*).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { fetchActiveWorkspaceIdPage } from "@/lib/cron/zeta-cron-workspace-pages";
import { generateOperationalNotificationsForWorkspace } from "@/lib/copilot-notifications/generate-operational-notifications";

const WORKSPACE_DELAY_MS = 100;
const MAX_WORKSPACES_PER_RUN = 50;
const TIMEOUT_GUARD_MS = 50_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function createServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type TenantError = { workspace_id: string; error: string };

export async function GET(request: NextRequest) {
  const started = Date.now();

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "missing_service_role" },
      { status: 500 }
    );
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "notifications_cron_started",
      timestamp: new Date().toISOString(),
    })
  );

  let afterId: string | null = null;
  let tenantsTotal = 0;
  let tenantsProcessed = 0;
  let tenantsFailed = 0;
  let notificationsCreated = 0;
  let notificationsSkipped = 0;
  const errors: TenantError[] = [];

  outer: while (true) {
    const page = await fetchActiveWorkspaceIdPage(supabase, afterId);
    if (page.ids.length === 0) break;
    afterId = page.nextAfterId;

    for (const workspaceId of page.ids) {
      tenantsTotal += 1;
      if (tenantsTotal > MAX_WORKSPACES_PER_RUN) break outer;

      if (Date.now() - started > TIMEOUT_GUARD_MS) {
        console.log(
          JSON.stringify({
            level: "warn",
            message: "notifications_cron_timeout_guard",
            elapsed_ms: Date.now() - started,
          })
        );
        break outer;
      }

      try {
        const result = await generateOperationalNotificationsForWorkspace({
          workspaceCompanyId: workspaceId,
        });
        if (result.ok) {
          tenantsProcessed += 1;
          notificationsCreated += result.created;
          notificationsSkipped += result.skipped;
        } else {
          tenantsFailed += 1;
          errors.push({ workspace_id: workspaceId, error: "generate_returned_not_ok" });
        }
      } catch (err) {
        tenantsFailed += 1;
        errors.push({
          workspace_id: workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await sleep(WORKSPACE_DELAY_MS);
    }

    if (!page.nextAfterId) break;
  }

  const elapsed = Date.now() - started;

  console.log(
    JSON.stringify({
      level: "info",
      message: "notifications_cron_completed",
      tenants_total: tenantsTotal,
      tenants_processed: tenantsProcessed,
      tenants_failed: tenantsFailed,
      notifications_created: notificationsCreated,
      notifications_skipped: notificationsSkipped,
      elapsed_ms: elapsed,
    })
  );

  return NextResponse.json({
    ok: true,
    tenants_total: tenantsTotal,
    tenants_processed: tenantsProcessed,
    tenants_failed: tenantsFailed,
    notifications_created: notificationsCreated,
    notifications_skipped: notificationsSkipped,
    errors: errors.slice(0, 10),
    elapsed_ms: elapsed,
  });
}
