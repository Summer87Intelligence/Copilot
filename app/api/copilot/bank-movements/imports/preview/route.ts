import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { collectBankStatementImportFilesFromFormData } from "@/lib/bank-movements/bank-movements-import-bulk";
import {
  MAX_BANK_STATEMENT_PDF_BYTES,
  MAX_BULK_PDF_FILES,
  MAX_BULK_TOTAL_BYTES,
} from "@/lib/bank-movements/bank-movements-import-constants";
import { previewSantanderBankStatementFiles } from "@/lib/bank-movements/santander-pdf-preview-service.server";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { getBankImportFileType } from "@/lib/treasury/santander-bank-import-file-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPPORTED_IMPORT_FILE_TYPES = new Set(["pdf", "xlsx"]);
const MAX_FILE_SIZE_MB = MAX_BANK_STATEMENT_PDF_BYTES / (1024 * 1024);
const MAX_BATCH_SIZE_MB = MAX_BULK_TOTAL_BYTES / (1024 * 1024);

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
    if (!auth.ok) {
      log.warn("bank_import_preview_auth_failed");
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const formData = await request.formData();
    const files = collectBankStatementImportFilesFromFormData(formData);

    log.info("bank_import_preview_start", {
      files_count: files.length,
      files: files.map((file) => ({
        name: file.name,
        size_bytes: file.size,
        mime: file.type,
        detected_type: getBankImportFileType(file),
      })),
    });

    if (files.length === 0) {
      log.warn("bank_import_preview_no_files");
      return NextResponse.json(
        { ok: false as const, error: "Subí uno o más archivos PDF o Excel consolidado de Santander." },
        { status: 400 }
      );
    }

    if (files.length > MAX_BULK_PDF_FILES) {
      log.warn("bank_import_preview_too_many_files", { files_count: files.length });
      return NextResponse.json(
        {
          ok: false as const,
          error: `Podés subir hasta ${MAX_BULK_PDF_FILES} extractos por lote.`,
        },
        { status: 400 }
      );
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_BULK_TOTAL_BYTES) {
      log.warn("bank_import_preview_batch_too_large", {
        total_bytes: totalBytes,
        max_bytes: MAX_BULK_TOTAL_BYTES,
      });
      return NextResponse.json(
        {
          ok: false as const,
          error: `El lote supera el tamaño máximo permitido (${MAX_BATCH_SIZE_MB} MB).`,
        },
        { status: 400 }
      );
    }

    for (const file of files) {
      const fileType = getBankImportFileType(file);
      if (!SUPPORTED_IMPORT_FILE_TYPES.has(fileType)) {
        log.warn("bank_import_preview_unsupported_type", {
          file_name: file.name,
          detected_type: fileType,
        });
        return NextResponse.json(
          {
            ok: false as const,
            error: "Este preview solo acepta archivos PDF o Excel (.xlsx) consolidado de Santander.",
          },
          { status: 400 }
        );
      }
      if (file.size > MAX_BANK_STATEMENT_PDF_BYTES) {
        log.warn("bank_import_preview_file_too_large", {
          file_name: file.name,
          size_bytes: file.size,
        });
        return NextResponse.json(
          {
            ok: false as const,
            error: `El archivo ${file.name} supera el límite de ${MAX_FILE_SIZE_MB} MB.`,
          },
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
    const durationMs = Date.now() - startedAt;

    log.info("bank_import_preview_success", {
      duration_ms: durationMs,
      parsed_count: data.parsed_count,
      failed_count: data.failed_count,
      total_movements_count: data.total_movements_count,
      totals_by_currency: {
        UYU: { movements_count: data.totals_by_currency.UYU.movements_count },
        USD: { movements_count: data.totals_by_currency.USD.movements_count },
      },
    });

    return NextResponse.json({
      ok: true as const,
      data,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    log.error("bank_import_preview_failed", error, { duration_ms: durationMs });
    return NextResponse.json(
      {
        ok: false as const,
        error: "No pudimos leer los extractos. Intentá de nuevo en unos segundos.",
      },
      { status: 500 }
    );
  }
}
