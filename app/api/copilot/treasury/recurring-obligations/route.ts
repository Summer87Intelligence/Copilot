import { NextRequest, NextResponse } from "next/server";

import {
  recurringObligationGenerateBodySchema,
  recurringObligationTemplateCreateBodySchema,
} from "@/lib/api/schemas/treasury-api-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import {
  recurringObligationGenerate,
  recurringObligationTemplateCreate,
  recurringObligationTemplateList,
} from "@/lib/treasury/services/recurring-obligation-template-service";
import {
  nextResponseFromTreasuryCrud,
  treasuryCreatedResponse,
} from "@/lib/treasury/treasury-http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const activeOnly = request.nextUrl.searchParams.get("active_only") === "true";
    const result = await recurringObligationTemplateList(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      activeOnly
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const json = await request.json();
    const parsedCreate = recurringObligationTemplateCreateBodySchema.safeParse(json);
    if (parsedCreate.success) {
      const result = await recurringObligationTemplateCreate(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        parsedCreate.data
      );
      return treasuryCreatedResponse(result);
    }

    const parsedGenerate = recurringObligationGenerateBodySchema.safeParse(json);
    if (parsedGenerate.success) {
      const result = await recurringObligationGenerate(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        parsedGenerate.data
      );
      return nextResponseFromTreasuryCrud(result);
    }

    return NextResponse.json(
      {
        ok: false as const,
        code: "VALIDATION" as const,
        message: "Body inválido para plantilla o generación recurrente.",
      },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
