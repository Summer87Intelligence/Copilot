import type { SantanderParsedMovement } from "@/lib/treasury/santander-statement-parser";
import { SantanderStatementParseError } from "@/lib/treasury/santander-bank-import-file-type";
import {
  isSantanderPdfStatementText,
  parseSantanderPdfStatementText,
  type SantanderPdfMetadata,
} from "@/lib/treasury/santander-pdf-statement-parser";
import { extractTextFromPdfBuffer } from "@/lib/treasury/santander-pdf-text-extract.server";

export type SantanderBankStatementParseResult = {
  metadata: SantanderPdfMetadata;
  movements: SantanderParsedMovement[];
};

export async function parseSantanderBankStatementPdfBuffer(
  buffer: Buffer
): Promise<SantanderBankStatementParseResult> {
  let text = "";
  try {
    text = await extractTextFromPdfBuffer(buffer);
  } catch {
    throw new SantanderStatementParseError("PDF_READ_FAILED");
  }

  if (!text.trim()) {
    throw new SantanderStatementParseError("PDF_READ_FAILED");
  }

  if (!isSantanderPdfStatementText(text)) {
    throw new SantanderStatementParseError("PDF_NOT_SANTANDER");
  }

  const { metadata, movements } = parseSantanderPdfStatementText(text);
  if (movements.length === 0) {
    throw new SantanderStatementParseError("PDF_READ_FAILED");
  }

  return { metadata, movements };
}
