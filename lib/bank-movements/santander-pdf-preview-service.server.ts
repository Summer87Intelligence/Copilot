import "server-only";

import {
  addPreviewToCurrencyTotals,
  buildBulkPreviewReadyItem,
  emptyCurrencyTotals,
  type BulkPreviewData,
} from "@/lib/bank-movements/bank-movements-import-bulk";
import {
  BANK_STATEMENT_PREVIEW_FALLBACK_ERROR,
  mapBankStatementPreviewError,
} from "@/lib/bank-movements/bank-movements-import-preview-errors";
import { buildSantanderConsolidatedExcelPreview } from "@/lib/bank-movements/santander-excel-consolidated-parser";
import {
  buildSantanderBankStatementPreview,
  type SantanderBankStatementPreview,
} from "@/lib/bank-movements/santander-pdf-parser";
import { extractTextFromPdfBuffer } from "@/lib/treasury/santander-pdf-text-extract.server";
import { getBankImportFileType } from "@/lib/treasury/santander-bank-import-file-type";

/** @deprecated Use BANK_STATEMENT_PREVIEW_FALLBACK_ERROR */
export const BANK_STATEMENT_PREVIEW_ERROR = BANK_STATEMENT_PREVIEW_FALLBACK_ERROR;

export async function previewSantanderBankStatementPdfBuffer(
  buffer: Buffer
): Promise<SantanderBankStatementPreview> {
  let text = "";
  try {
    text = await extractTextFromPdfBuffer(buffer);
  } catch {
    throw new Error("PDF_READ_FAILED");
  }

  if (!text.trim()) {
    throw new Error("PDF_READ_FAILED");
  }

  try {
    return buildSantanderBankStatementPreview(text);
  } catch {
    throw new Error("PARSE_FAILED");
  }
}

async function previewSantanderConsolidatedExcelBuffer(
  buffer: Buffer
): Promise<SantanderBankStatementPreview> {
  try {
    return await buildSantanderConsolidatedExcelPreview(buffer);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_CONSOLIDATED" || code === "NO_MOVEMENTS" || code === "EMPTY_FILE") {
      throw error;
    }
    throw new Error("EXCEL_READ_FAILED");
  }
}

async function previewSantanderBankStatementFile(input: {
  fileName: string;
  buffer: Buffer;
}): Promise<SantanderBankStatementPreview> {
  const fileType = getBankImportFileType({ name: input.fileName });
  if (fileType === "pdf") {
    return previewSantanderBankStatementPdfBuffer(input.buffer);
  }
  if (fileType === "xlsx") {
    return previewSantanderConsolidatedExcelBuffer(input.buffer);
  }
  throw new Error("UNSUPPORTED");
}

export async function previewSantanderBankStatementFiles(
  files: { fileName: string; buffer: Buffer }[]
): Promise<BulkPreviewData> {
  const previews: BulkPreviewData["previews"] = [];
  const errors: BulkPreviewData["errors"] = [];
  const totals_by_currency = {
    UYU: emptyCurrencyTotals(),
    USD: emptyCurrencyTotals(),
  };
  let total_movements_count = 0;

  for (const file of files) {
    try {
      const preview = await previewSantanderBankStatementFile(file);
      const ready = buildBulkPreviewReadyItem(file.fileName, preview);
      previews.push(ready);
      totals_by_currency[preview.currency_code] = addPreviewToCurrencyTotals(
        totals_by_currency[preview.currency_code],
        preview
      );
      total_movements_count += preview.movements_count;
    } catch (error) {
      errors.push({
        file_name: file.fileName,
        status: "error",
        error: mapBankStatementPreviewError(error),
      });
    }
  }

  return {
    files_count: files.length,
    parsed_count: previews.length,
    failed_count: errors.length,
    total_movements_count,
    totals_by_currency,
    previews,
    errors,
  };
}

/** @deprecated Use previewSantanderBankStatementFiles */
export async function previewSantanderBankStatementPdfFiles(
  files: { fileName: string; buffer: Buffer }[]
): Promise<BulkPreviewData> {
  return previewSantanderBankStatementFiles(files);
}
