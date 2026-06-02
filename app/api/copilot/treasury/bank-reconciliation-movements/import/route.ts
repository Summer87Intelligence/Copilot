import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { bankReconciliationImportBodySchema } from "@/lib/api/schemas/treasury-api-bodies";
import { resolveBankImportAuthMode } from "@/lib/auth/bank-import-auth-mode";
import {
  requireCopilotTenantContext,
  requireCopilotWriteContext,
} from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { bankReconciliationImportSantander } from "@/lib/treasury/services/bank-reconciliation-import-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseAndValidateJsonBody(request, bankReconciliationImportBodySchema);
    if (!parsed.ok) return parsed.response;

    const authMode = resolveBankImportAuthMode(parsed.data.apply);
    const auth =
      authMode === "write"
        ? await requireCopilotWriteContext(request, parsed.data as Record<string, unknown>)
        : await requireCopilotTenantContext(request, parsed.data as Record<string, unknown>);
    if (!auth.ok) return auth.response;

    const result = await bankReconciliationImportSantander(
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
