import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { collectBankStatementImportFilesFromFormData } from "@/lib/bank-movements/bank-movements-import-bulk";
import {
  MAX_BANK_STATEMENT_PDF_BYTES,
  MAX_BULK_PDF_FILES,
} from "@/lib/bank-movements/bank-movements-import-constants";
import { previewSantanderBankStatementFiles } from "@/lib/bank-movements/santander-pdf-preview-service.server";
import { getBankImportFileType } from "@/lib/treasury/santander-bank-import-file-type";

export const dynamic = "force-dynamic";

const SUPPORTED_IMPORT_FILE_TYPES = new Set(["pdf", "xlsx"]);

export async function POST(request: NextRequest) {
  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const files = collectBankStatementImportFilesFromFormData(formData);

  if (files.length === 0) {
    return NextResponse.json(
      { ok: false as const, error: "Subí uno o más archivos PDF o Excel consolidado de Santander." },
      { status: 400 }
    );
  }

  if (files.length > MAX_BULK_PDF_FILES) {
    return NextResponse.json(
      {
        ok: false as const,
        error: `Podés subir hasta ${MAX_BULK_PDF_FILES} extractos por lote.`,
      },
      { status: 400 }
    );
  }

  for (const file of files) {
    const fileType = getBankImportFileType(file);
    if (!SUPPORTED_IMPORT_FILE_TYPES.has(fileType)) {
      return NextResponse.json(
        {
          ok: false as const,
          error: "Este preview solo acepta archivos PDF o Excel (.xlsx) consolidado de Santander.",
        },
        { status: 400 }
      );
    }
    if (file.size > MAX_BANK_STATEMENT_PDF_BYTES) {
      return NextResponse.json(
        { ok: false as const, error: `El archivo ${file.name} supera el límite de 10 MB.` },
        { status: 400 }
      );
    }
  }

  const inputs = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    }))
  );

  const data = await previewSantanderBankStatementFiles(inputs);

  return NextResponse.json({
    ok: true as const,
    data,
  });
}
