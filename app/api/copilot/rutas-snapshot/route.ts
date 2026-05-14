import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  OperationalEventRequestBuffer,
  recordSnapshotDegradedEvent,
} from "@/lib/copilot-operational-events";
import { buildCopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot";
import {
  readCachedRutasSnapshot,
  writeCachedRutasSnapshot,
} from "@/lib/copilot-rutas-snapshot-cache";
import { buildSnapshotHealth, logSnapshotObservability } from "@/lib/copilot-rutas-snapshot-health";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

function wantsFreshSnapshot(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("fresh") === "1";
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const fresh = wantsFreshSnapshot(request);
    if (!fresh) {
      const cached = readCachedRutasSnapshot(auth.ctx.tenantCompanyId);
      if (cached) {
        const data = {
          ...cached,
          health: buildSnapshotHealth(cached.health.warnings, {
            feedAvailable: cached.health.status !== "error",
            fromCache: true,
            timingMs: cached.health.timingMs,
          }),
        };
        logSnapshotObservability({
          health: data.health,
          counts: data.counts,
          cacheHit: true,
        });
        return NextResponse.json({
          ok: true as const,
          partial: data.health.status !== "ok",
          data,
        });
      }
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const data = await buildCopilotRutasSnapshot(supabase, auth.ctx.tenantCompanyId);
    if (data.health.status === "degraded") {
      const eventBuffer = new OperationalEventRequestBuffer();
      await recordSnapshotDegradedEvent(
        supabase,
        auth.ctx.tenantCompanyId,
        data.health.warnings.map((warning) => warning.message).join(" · "),
        {
          status: data.health.status,
          warnings: data.health.warnings,
        },
        { label: "Sistema" },
        eventBuffer
      );
    }
    if (data.health.status !== "error") {
      writeCachedRutasSnapshot(auth.ctx.tenantCompanyId, data);
    }

    return NextResponse.json({
      ok: true as const,
      partial: data.health.status !== "ok",
      data,
    });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/rutas-snapshot",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      {
        ok: false as const,
        code: "UNEXPECTED",
        message,
      },
      { status: 500 }
    );
  }
}
