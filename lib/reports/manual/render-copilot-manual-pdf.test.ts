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
  it("genera PDF completo con secciones críticas del manual web", async () => {
    const buf = await renderCopilotManualPdf({
      generatedAt: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(buf.length).toBeGreaterThan(15_000);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");

    const text = await extractPdfText(buf);

    expect(text).toContain("Manual de Usuario");
    expect(text).toContain("Roles y permisos");
    expect(text).toContain("superadmin");
    expect(text).toContain("usuario");
    expect(text).toContain("demo_readonly");
    expect(text).toContain("Movimientos bancarios");
    expect(text).toContain("Tareas diarias");
    expect(text).toMatch(/PDF/);
    expect(text).toMatch(/concilia/i);
    expect(text).toContain("Tesorería");
    expect(text).toContain("Fecha de corte");
    expect(text).toContain("Último mes cerrado");
    expect(text).toContain("Deuda actual");
    expect(text).toContain("Deuda vencida");
    expect(text).toMatch(/Cobranza mensual|Reporte de cobranza mensual/i);
    expect(text).not.toMatch(/Personalización\s*—/i);
    expect(text).not.toMatch(/Configuración\s*—\s*Ajustes del workspace/i);
  }, 15_000);
});
