import "server-only";

import { extractTextFromPdfBuffer } from "@/lib/treasury/santander-pdf-text-extract.server";
import {
  buildSantanderBankStatementPreview,
  type SantanderBankStatementPreview,
} from "@/lib/bank-movements/santander-pdf-parser";

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
