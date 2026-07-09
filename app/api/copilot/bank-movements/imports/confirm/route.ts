import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { bankStatementImportConfirmBodySchema } from "@/lib/bank-movements/bank-movements-import-api";
import { confirmSantanderBankStatementImport } from "@/lib/bank-movements/santander-bank-statement-import-persist.server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, bankStatementImportConfirmBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "bank_movements",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  try {
    const result = await confirmSantanderBankStatementImport({
      supabase,
      workspaceId: tenantCompanyId,
      importedBy: appUser.id,
      fileName: parsed.data.file_name,
      preview: parsed.data.preview,
    });

    return NextResponse.json({
      ok: true as const,
      data: result,
    });
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo confirmar la importación del extracto." },
      { status: 500 }
    );
  }
}
