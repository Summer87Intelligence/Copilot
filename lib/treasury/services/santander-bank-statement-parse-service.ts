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

  if (process.env.NODE_ENV === "development") {
    const normalized = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    console.log("[santander-pdf] extractedText length:", text.length);
    console.log("[santander-pdf] first 500 chars:", text.slice(0, 500));
    console.log("[santander-pdf] markers:", {
      santander: normalized.includes("santander"),
      cliente: normalized.includes("cliente"),
      cuenta: normalized.includes("cuenta"),
      moneda: normalized.includes("moneda"),
      movimientos: normalized.includes("movimientos"),
      fecha: normalized.includes("fecha"),
      referencia: normalized.includes("referencia"),
      debito: normalized.includes("debito"),
      credito: normalized.includes("credito"),
      saldo: normalized.includes("saldo"),
      dateRange: /\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(text),
    });
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
