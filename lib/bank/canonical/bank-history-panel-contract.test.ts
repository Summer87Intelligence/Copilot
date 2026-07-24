import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-2026-CLEANUP UI —
 * Historial mantiene Identificaciones + Importaciones como vista read-only.
 * No hay reversión financiera activa, ni botón de revertir, ni llamadas a
 * RPC/rutas de reverse.
 */

const historyPanel = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "bank-history-panel.tsx"),
  "utf8"
);

describe("BankHistoryPanel — identificaciones e importaciones, solo lectura, sin reversión", () => {
  it("usa solo lecturas GET y no contiene escrituras directas en el panel", () => {
    expect(historyPanel).toContain("/api/copilot/bank-reconciliation/client-identifications/recent?limit=50");
    expect(historyPanel).not.toMatch(/method:\s*["'](POST|PATCH|DELETE)["']/);
  });

  it("no llama ninguna ruta de reversión ni RPC de reverse", () => {
    expect(historyPanel).not.toContain("reverse_bank_reconciliation_v1");
    expect(historyPanel).not.toMatch(/\/reverse/);
  });

  it("no expone botón de reversión en esta fase", () => {
    expect(historyPanel).not.toMatch(/Revertir/);
  });

  it("BANK-2026-CLEANUP UI: agrupa identificaciones por cliente (15 por página) con avatar y detalle expandible", () => {
    expect(historyPanel).toContain("Identificaciones por cliente");
    expect(historyPanel).toContain("Movimientos bancarios asociados a cada cliente y correcciones realizadas.");
    expect(historyPanel).not.toContain("Conciliaciones por cliente");
    expect(historyPanel).toContain("Importaciones");
    expect(historyPanel).toContain("CLIENTS_PER_PAGE = 15");
    expect(historyPanel).toContain("ClientAvatar");
    expect(historyPanel).toContain("groupIdentificationsByClient");
    expect(historyPanel).toContain("Totales asociados:");
    expect(historyPanel).not.toContain("groupDecisionsByClient");
    expect(historyPanel).not.toContain("Facturas comprobadas");
  });

  it("BANK-2026-CLEANUP UI: usa TablePagination canónica y reset declarativo (sin setPage en effect)", () => {
    expect(historyPanel).toContain('from "@/components/copilot/ui/table-pagination"');
    expect(historyPanel).toContain("TablePagination");
    expect(historyPanel).toContain("resolveKeyedPage");
    expect(historyPanel).toContain("keyedPageAt");
    expect(historyPanel).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[^}]*setImportsPage/);
    expect(historyPanel).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[^}]*setPage\(1\)/);
  });

  it("BANK-IMPORT-ACTOR-DISPLAY: Importado por con truncate; nunca UUID como label principal en markup", () => {
    expect(historyPanel).toContain("Importado por");
    expect(historyPanel).toContain('data-testid="bank-import-actor"');
    expect(historyPanel).toContain("resolveImportActorSecondaryEmail");
    expect(historyPanel).toContain("truncate");
    expect(historyPanel).not.toMatch(/stats\.actor \? ` · \$\{stats\.actor\}`/);
    // No imprimir ids técnicos en JSX.
    expect(historyPanel).not.toMatch(/\{[^}]*imported_by[^}]*\}/);
    expect(historyPanel).not.toMatch(/actor\.id/);
    expect(historyPanel).not.toContain("actors_unresolved");
  });
});
