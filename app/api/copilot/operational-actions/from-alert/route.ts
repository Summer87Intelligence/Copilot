import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { operationalActionFromAlertBodySchema } from "@/lib/api/schemas/copilot-api-bodies";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { createOperationalActionFromAlert } from "@/lib/copilot-operational-actions-service";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

function actorFromContext(ctx: {
  authUser: { id: string };
  appUser: { full_name: string; email: string };
}) {
  return {
    id: ctx.authUser.id,
    label: ctx.appUser.full_name?.trim() || ctx.appUser.email,
  };
}

export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const validated = await parseAndValidateJsonBody(
    request,
    operationalActionFromAlertBodySchema
  );
  if (!validated.ok) return validated.response;

  try {
    const auth = await requireCopilotTenantContext(request, validated.data);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const body = validated.data;
    const alert: FiscalAlertItem = {
      id: body.alert_id,
      title: body.title,
      priority: body.priority,
      type: body.alert_type,
      summary: body.summary,
      detail: body.detail ?? body.summary,
      obligationId: body.obligation_id ?? null,
    };

    const result = await createOperationalActionFromAlert(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      alert,
      actorFromContext(auth.ctx)
    );

    if (!result.ok) {
      return copilotInternalErrorResponse();
    }

    return NextResponse.json({ action: result.data, message: result.message });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "POST /api/copilot/operational-actions/from-alert",
    });
    return copilotInternalErrorResponse({});
  }
}
