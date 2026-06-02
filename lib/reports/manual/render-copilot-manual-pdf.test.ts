import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";

import { renderCopilotManualPdf } from "@/lib/reports/manual/render-copilot-manual-pdf";

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

describe("renderCopilotManualPdf", () => {
  it("genera PDF con título y secciones críticas", async () => {
    const buf = await renderCopilotManualPdf({
      generatedAt: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");

    const text = await extractPdfText(buf);
    expect(text).toContain("Manual de Usuario");
    expect(text).toContain("Roles y permisos");
    expect(text).toContain("Importador bancario Santander");
    expect(text).toContain("Solo lectura");
    expect(text).not.toMatch(/Personalización\s*—/i);
    expect(text).not.toMatch(/Configuración\s*—\s*Ajustes del workspace/i);
  });
});
