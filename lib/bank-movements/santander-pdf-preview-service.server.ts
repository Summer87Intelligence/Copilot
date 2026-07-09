import "server-only";

import {
  addPreviewToCurrencyTotals,
  buildBulkPreviewReadyItem,
  emptyCurrencyTotals,
  type BulkPreviewData,
} from "@/lib/bank-movements/bank-movements-import-bulk";
import {
  buildSantanderBankStatementPreview,
  type SantanderBankStatementPreview,
} from "@/lib/bank-movements/santander-pdf-parser";
import { extractTextFromPdfBuffer } from "@/lib/treasury/santander-pdf-text-extract.server";

export const BANK_STATEMENT_PREVIEW_ERROR =
  "No pudimos leer este extracto. Revisá que sea un PDF de Santander con tabla de movimientos.";

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

export async function previewSantanderBankStatementPdfFiles(
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
      const preview = await previewSantanderBankStatementPdfBuffer(file.buffer);
      const ready = buildBulkPreviewReadyItem(file.fileName, preview);
      previews.push(ready);
      totals_by_currency[preview.currency_code] = addPreviewToCurrencyTotals(
        totals_by_currency[preview.currency_code],
        preview
      );
      total_movements_count += preview.movements_count;
    } catch {
      errors.push({
        file_name: file.fileName,
        status: "error",
        error: BANK_STATEMENT_PREVIEW_ERROR,
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
