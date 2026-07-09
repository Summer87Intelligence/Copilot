import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  BANK_STATEMENT_PREVIEW_ERROR,
  previewSantanderBankStatementPdfBuffer,
} from "@/lib/bank-movements/santander-pdf-preview-service.server";
import { getBankImportFileType } from "@/lib/treasury/santander-bank-import-file-type";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false as const, error: "Subí un archivo PDF de Santander." },
      { status: 400 }
    );
  }

  const fileType = getBankImportFileType(file);
  if (fileType !== "pdf") {
    return NextResponse.json(
      { ok: false as const, error: "Este preview solo acepta archivos PDF." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await previewSantanderBankStatementPdfBuffer(buffer);

    return NextResponse.json({
      ok: true as const,
      data: preview,
    });
  } catch {
    return NextResponse.json(
      { ok: false as const, error: BANK_STATEMENT_PREVIEW_ERROR },
      { status: 400 }
    );
  }
}
