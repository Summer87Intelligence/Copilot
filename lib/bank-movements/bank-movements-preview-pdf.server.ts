import "server-only";

import { buildSantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import type { SantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import { extractTextFromPdfBuffer } from "@/lib/treasury/santander-pdf-text-extract.server";

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
