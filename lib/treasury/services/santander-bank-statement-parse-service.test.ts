import { describe, expect, it, vi } from "vitest";

import { SantanderStatementParseError } from "@/lib/treasury/santander-bank-import-file-type";
import { NON_SANTANDER_PDF_FIXTURE } from "@/lib/treasury/fixtures/santander-pdf-umsatz-text.fixture";
import { parseSantanderBankStatementPdfBuffer } from "@/lib/treasury/services/santander-bank-statement-parse-service";

vi.mock("@/lib/treasury/santander-pdf-text-extract.server", () => ({
  extractTextFromPdfBuffer: vi.fn(),
}));

import { extractTextFromPdfBuffer } from "@/lib/treasury/santander-pdf-text-extract.server";

describe("santander-bank-statement-parse-service", () => {
  it("devuelve error controlado para PDF no Santander", async () => {
    vi.mocked(extractTextFromPdfBuffer).mockResolvedValue(NON_SANTANDER_PDF_FIXTURE);
    await expect(parseSantanderBankStatementPdfBuffer(Buffer.from("%PDF"))).rejects.toMatchObject({
      code: "PDF_NOT_SANTANDER",
    } satisfies Partial<SantanderStatementParseError>);
  });
});
