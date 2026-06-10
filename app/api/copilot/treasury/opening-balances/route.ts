import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import {
  treasuryCashOpeningBalanceList,
  treasuryCashOpeningBalanceUpsert,
} from "@/lib/treasury/services/treasury-cash-opening-balance-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

const upsertSchema = z
  .object({
    workspace_id: z.never().optional(),
    currency_code: z.enum(["UYU", "USD"]),
    amount: z.number().finite().min(0, "El monto debe ser >= 0."),
    effective_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const result = await treasuryCashOpeningBalanceList(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const parsed = await parseAndValidateJsonBody(request, upsertSchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria",
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await treasuryCashOpeningBalanceUpsert(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      parsed.data
    );
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
