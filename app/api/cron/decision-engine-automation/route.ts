/**
 * GET /api/cron/decision-engine-automation
 *
 * Scheduler-ready (NO activar en vercel.json hasta go-live).
 * Multi-tenant, anti-overlap, timeout-safe, structured logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { fetchActiveWorkspaceIdPage } from "@/lib/cron/zeta-cron-workspace-pages";
import { findActiveAutomationRun } from "@/lib/data/decision-automation-repository";
import {
  AUTOMATION_ACTOR_ID,
  runOperationalAutomation,
} from "@/lib/decision-engine/operational-automation-runner";

const WORKSPACE_DELAY_MS = 200;
const MAX_WORKSPACES_PER_RUN = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
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

export async function GET(request: NextRequest) {
  const started = Date.now();

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "automation_cron_started",
      timestamp: new Date().toISOString(),
    })
  );

  let afterId: string | null = null;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { workspace_id: string; error: string }[] = [];

  while (processed + skipped + failed < MAX_WORKSPACES_PER_RUN) {
    const page = await fetchActiveWorkspaceIdPage(supabase, afterId);
    if (page.ids.length === 0) break;
    afterId = page.nextAfterId;

    for (const workspaceId of page.ids) {
      if (processed + skipped + failed >= MAX_WORKSPACES_PER_RUN) break;

      if (Date.now() - started > 50_000) {
        console.log(
          JSON.stringify({
            level: "warn",
            message: "automation_cron_timeout_guard",
            elapsed_ms: Date.now() - started,
          })
        );
        break;
      }

      try {
        const active = await findActiveAutomationRun(supabase, workspaceId);
        if (active) {
          skipped += 1;
          continue;
        }

        await runOperationalAutomation(supabase, workspaceId, {
          dryRun: false,
          actorUserId: AUTOMATION_ACTOR_ID,
        });
        processed += 1;
      } catch (err) {
        failed += 1;
        errors.push({
          workspace_id: workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await sleep(WORKSPACE_DELAY_MS);
    }

    if (!page.nextAfterId) break;
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "automation_cron_completed",
      processed,
      skipped,
      failed,
      elapsed_ms: Date.now() - started,
    })
  );

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    failed,
    errors: errors.slice(0, 10),
    elapsed_ms: Date.now() - started,
  });
}
