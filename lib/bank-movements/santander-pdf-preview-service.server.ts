import "server-only";

import { BANK_STATEMENT_PREVIEW_FALLBACK_ERROR } from "@/lib/bank-movements/bank-movements-import-preview-errors";

export {
  previewSantanderBankStatementFiles,
  previewSantanderBankStatementPdfFiles,
} from "@/lib/bank-movements/bank-movements-preview-dispatcher.server";

/** @deprecated Use BANK_STATEMENT_PREVIEW_FALLBACK_ERROR */
export const BANK_STATEMENT_PREVIEW_ERROR = BANK_STATEMENT_PREVIEW_FALLBACK_ERROR;

export async function previewSantanderBankStatementPdfBuffer(buffer: Buffer) {
  const { previewSantanderBankStatementPdfBuffer } = await import(
    "@/lib/bank-movements/bank-movements-preview-pdf.server"
  );
  return previewSantanderBankStatementPdfBuffer(buffer);
}
