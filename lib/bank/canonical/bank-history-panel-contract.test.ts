import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001, sección 17 —
 * Historial ahora también muestra decisiones terminales (confirmadas/
 * rechazadas), pero la reversión sigue explícitamente fuera de alcance: sin
 * botón activo, sin llamada a `reverse_bank_reconciliation_v1` ni a ningún
 * endpoint de reversión.
 */

const historyPanel = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "bank-history-panel.tsx"),
  "utf8"
);

describe("BankHistoryPanel — decisiones recientes, solo lectura, sin reversión", () => {
  it("lee únicamente el modo workspace=history del endpoint canónico (GET, sin body de escritura)", () => {
    expect(historyPanel).toContain("canonical-suggestions?workspace=history");
    expect(historyPanel).not.toMatch(/method:\s*["'](POST|PATCH|DELETE)["']/);
  });

  it("no llama ninguna ruta de reversión ni RPC de reverse", () => {
    expect(historyPanel).not.toContain("reverse_bank_reconciliation_v1");
    expect(historyPanel).not.toMatch(/\/reverse/);
  });

  it("el botón de reversión está deshabilitado (fuera de alcance esta fase)", () => {
    const buttonBlock = historyPanel.match(/<button[\s\S]*?Revertir[\s\S]*?<\/button>/)![0];
    expect(buttonBlock).toContain("disabled");
  });

  it("muestra estados terminales confirmed/rejected con etiquetas en español", () => {
    expect(historyPanel).toContain('confirmed: "Conciliado"');
    expect(historyPanel).toContain('rejected: "Rechazado"');
  });
});
