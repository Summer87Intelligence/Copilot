import "server-only";

import {
  addPreviewToCurrencyTotals,
  buildBulkPreviewReadyItem,
  emptyCurrencyTotals,
  type BulkPreviewData,
} from "@/lib/bank-movements/bank-movements-import-bulk";
import { mapBankStatementPreviewError } from "@/lib/bank-movements/bank-movements-import-preview-errors";
import type { SantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import { getBankImportFileType } from "@/lib/treasury/santander-bank-import-file-type";

async function previewSantanderBankStatementFile(input: {
  fileName: string;
  buffer: Buffer;
}): Promise<SantanderBankStatementPreview> {
  const fileType = getBankImportFileType({ name: input.fileName });
  if (fileType === "xlsx") {
    const { previewSantanderBankStatementExcelBuffer } = await import(
      "@/lib/bank-movements/bank-movements-preview-excel.server"
    );
    return previewSantanderBankStatementExcelBuffer(input.buffer);
  }
  if (fileType === "pdf") {
    const { previewSantanderBankStatementPdfBuffer } = await import(
      "@/lib/bank-movements/bank-movements-preview-pdf.server"
    );
    return previewSantanderBankStatementPdfBuffer(input.buffer);
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
