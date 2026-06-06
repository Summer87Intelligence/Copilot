import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { getBankImportFileType } from "@/lib/treasury/santander-bank-import-file-type";
import { SantanderStatementParseError } from "@/lib/treasury/santander-bank-import-file-type";
import { parseSantanderBankStatementPdfBuffer } from "@/lib/treasury/services/santander-bank-statement-parse-service";
import { COPILOT_INTERNAL_ERROR_MESSAGE } from "@/lib/api/copilot-request-errors";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request, {});
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Subí un archivo CSV, Excel o PDF.",
        },
        { status: 400 }
      );
    }

    const fileType = getBankImportFileType(file);
    if (fileType !== "pdf") {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Este endpoint solo procesa PDF. Usá CSV o Excel en el cliente.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseSantanderBankStatementPdfBuffer(buffer);

    return NextResponse.json({
      ok: true as const,
      data: result,
      message: "Extracto PDF Santander leído correctamente.",
    });
  } catch (error) {
    if (error instanceof SantanderStatementParseError) {
      return NextResponse.json(
        {
          ok: false as const,
          code: error.code,
          message: COPILOT_INTERNAL_ERROR_MESSAGE,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
