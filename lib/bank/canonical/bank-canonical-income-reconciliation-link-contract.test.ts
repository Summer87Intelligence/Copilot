import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001, sección 19 — "Revisar conciliación" en
 * Ingresos debe abrir la sugerencia operational puntual de ese movimiento en
 * Conciliación, nunca reactivar Motor B como flujo completo de conciliación
 * ni escribir nada nuevo desde Ingresos.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const incomePanel = readFileSync(join(COMPONENTS_ROOT, "bank-income-panel.tsx"), "utf8");
const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const canonicalPanel = readFileSync(join(COMPONENTS_ROOT, "bank-canonical-reconciliation-panel.tsx"), "utf8");

describe("Ingresos → Conciliación: enlace de solo navegación, sin escritura nueva", () => {
  it("BankIncomePanel detecta la sugerencia canónica vía GET (nunca POST/PATCH/DELETE)", () => {
    expect(incomePanel).toContain("/api/copilot/bank-movements/canonical-suggestions?movementId=");
    const canonicalCallBlock = incomePanel.split("canonical-suggestions?movementId=")[1]?.slice(0, 300) ?? "";
    expect(canonicalCallBlock).not.toMatch(/method:\s*["'](POST|PATCH|DELETE)["']/);
  });

  it("el botón 'Revisar conciliación' solo navega (onOpenReconciliation), no asocia ni concilia desde Ingresos", () => {
    expect(incomePanel).toContain("Revisar conciliación");
    expect(incomePanel).toContain("onOpenReconciliation(movement.id)");
  });

  it("el page client conecta Ingresos → foco de movimiento → tab Conciliación (no un motor nuevo)", () => {
    expect(pageClient).toContain("onOpenReconciliation={(movementId) => {");
    expect(pageClient).toContain("setFocusMovementId(movementId)");
    expect(pageClient).toContain('setTab("conciliacion")');
  });

  it("BankCanonicalReconciliationPanel consume el foco vía prop, no vía un endpoint de escritura nuevo", () => {
    expect(canonicalPanel).toContain("initialMovementId");
    expect(canonicalPanel).toContain("movementId=${encodeURIComponent(movementFocusId)}");
  });
});
