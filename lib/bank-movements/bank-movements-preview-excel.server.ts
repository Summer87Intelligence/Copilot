import "server-only";

import { buildSantanderConsolidatedExcelPreview } from "@/lib/bank-movements/santander-excel-consolidated-parser";
import type { SantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";

export async function previewSantanderBankStatementExcelBuffer(
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
