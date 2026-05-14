import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  buildAutomationGovernanceResponse,
  patchAutomationGovernanceRule,
  persistGovernanceRuleToDb,
} from "@/lib/copilot-operational-governance";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

export const dynamic = "force-dynamic";

function validateMutedUntil(value: unknown): string | null | { error: string } {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return { error: "mutedUntil debe ser string ISO 8601 o null." };
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return { error: "mutedUntil no es una fecha ISO 8601 válida." };
  return value;
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

    return NextResponse.json({
      ok: true as const,
      ...buildAutomationGovernanceResponse(auth.ctx.tenantCompanyId),
    });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/automation-governance",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      {
        ok: false as const,
        code: "UNEXPECTED",
        message,
        rules: [],
        activeAutomations: [],
        auditEvents: [],
        generatedAt: new Date().toISOString(),
        health: { status: "partial", warnings: [{ source: "governance", code: "UNEXPECTED", message }] },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const body = (await request.json()) as {
      ruleId?: string;
      enabled?: boolean;
      mutedUntil?: string | null;
      cooldownMinutes?: number;
    };

    if (!body.ruleId || typeof body.ruleId !== "string") {
      return NextResponse.json(
        { ok: false as const, code: "INVALID_BODY", message: "ruleId es obligatorio." },
        { status: 400 }
      );
    }

    // Validar mutedUntil estrictamente
    if (body.mutedUntil !== undefined) {
      const validated = validateMutedUntil(body.mutedUntil);
      if (typeof validated === "object" && validated !== null && "error" in validated) {
        return NextResponse.json(
          { ok: false as const, code: "INVALID_MUTED_UNTIL", message: validated.error },
          { status: 400 }
        );
      }
    }

    // Validar cooldownMinutes
    if (body.cooldownMinutes !== undefined) {
      if (!Number.isInteger(body.cooldownMinutes) || body.cooldownMinutes < 0) {
        return NextResponse.json(
          { ok: false as const, code: "INVALID_COOLDOWN", message: "cooldownMinutes debe ser entero >= 0." },
          { status: 400 }
        );
      }
    }

    const patch = {
      enabled: body.enabled,
      mutedUntil: body.mutedUntil,
      cooldownMinutes: body.cooldownMinutes,
    };

    const state = patchAutomationGovernanceRule(auth.ctx.tenantCompanyId, body.ruleId, patch);

    // Persistir a DB (fire-and-forget); usar cliente con contexto de sesión si disponible
    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;
    const actorLabel = auth.ctx.appUser.full_name?.trim() || auth.ctx.appUser.email;
    persistGovernanceRuleToDb(supabase, auth.ctx.tenantCompanyId, body.ruleId, patch, actorLabel);

    log.info("copilot_governance_rule_patched", {
      rule_id: body.ruleId,
      enabled: body.enabled,
      muted_until: body.mutedUntil ?? null,
    });

    return NextResponse.json({
      ok: true as const,
      state,
      ...buildAutomationGovernanceResponse(auth.ctx.tenantCompanyId),
    });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "PATCH /api/copilot/automation-governance",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", message },
      { status: 500 }
    );
  }
}
