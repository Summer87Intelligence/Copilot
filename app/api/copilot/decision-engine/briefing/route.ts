/**
 * GET /api/copilot/decision-engine/briefing
 *
 * Retorna el DailyBriefing del Motor de Decisiones.
 * Estrategia: cache-first con TTL de 60 min en decision_snapshots.
 * ?force=true fuerza recálculo aunque el snapshot esté vigente.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { loadDecisionEngineBundle } from "@/lib/data/decision-engine-data-loader";
import { generateDailyBriefing } from "@/lib/decision-engine/daily-briefing-generator";
import {
  isBriefingSnapshotFresh,
  readBriefingSnapshot,
  upsertBriefingSnapshot,
  upsertPortfolioScoreHistory,
} from "@/lib/data/decision-snapshot-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const t0 = Date.now();

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("de_briefing_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const { supabase, tenantCompanyId } = auth.ctx;
    const forceRefresh = request.nextUrl.searchParams.get("force") === "true";

    // 1. Cache check
    if (!forceRefresh) {
      const cached = await readBriefingSnapshot(supabase, tenantCompanyId);
      if (cached && isBriefingSnapshotFresh(cached)) {
        log.info("de_briefing_cache_hit", {
          generated_at: cached.generated_at,
          expires_at: cached.expires_at,
        });
        return NextResponse.json({
          ok: true as const,
          briefing: cached.payload,
          cached: true,
          generated_at: cached.generated_at,
        });
      }
    }

    // 2. Load + compute
    const bundle = await loadDecisionEngineBundle(supabase, tenantCompanyId);
    const briefing = generateDailyBriefing(bundle);
    const generationMs = Date.now() - t0;

    // 3. Persist snapshot (fire-and-forget — don't block response on write errors)
    const persistPromises: Promise<void>[] = [
      upsertBriefingSnapshot(supabase, tenantCompanyId, briefing, generationMs),
      upsertPortfolioScoreHistory(
        supabase,
        tenantCompanyId,
        briefing.portfolio_score,
        briefing.generated_at
      ),
    ];
    Promise.all(persistPromises).catch((err) => {
      log.warn("de_briefing_persist_error", { message: String(err) });
    });

    log.info("de_briefing_generated", {
      score: briefing.portfolio_score.score,
      band: briefing.portfolio_score.band,
      urgent_count: briefing.urgent.length,
      important_count: briefing.important.length,
      alerts_count: briefing.alerts.length,
      generation_ms: generationMs,
      debtors: briefing.total_debtors,
    });

    return NextResponse.json({
      ok: true as const,
      briefing,
      cached: false,
      generated_at: briefing.generated_at,
    });
  } catch (error) {
    log.error("de_briefing_unhandled", error, {
      route: "GET /api/copilot/decision-engine/briefing",
      elapsed_ms: Date.now() - t0,
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", message },
      { status: 500 }
    );
  }
}
