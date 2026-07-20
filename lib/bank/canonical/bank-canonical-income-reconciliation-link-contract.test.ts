import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001, sección 1/18 —
 * reemplaza el contrato de BANK-CANONICAL-CONFIRM-UI-001 sección 19 (enlace
 * Ingresos → Conciliación entre dos pantallas separadas). Ahora no hay dos
 * pantallas: cualquier URL antigua que apuntara a la extinta pestaña
 * Conciliación (`?tab=reconciliation`, `?tab=conciliacion`) debe normalizar a
 * Ingresos preservando `movementId`, sin dejar enlaces rotos ni un segundo tab.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const incomeWorkspace = readFileSync(join(COMPONENTS_ROOT, "bank-income-workspace.tsx"), "utf8");

describe("Deep link: URLs antiguas de Conciliación normalizan a Ingresos", () => {
  it("el efecto de deep link reconoce tab=reconciliation y tab=conciliacion, ambos normalizando a Ingresos", () => {
    const effectBlock = pageClient.match(/useEffect\(\(\) => \{\s*if \(deepLinkApplied[\s\S]*?\}, \[searchParams\]\);/)![0];
    expect(effectBlock).toContain('requestedTab === "reconciliation"');
    expect(effectBlock).toContain('requestedTab === "conciliacion"');
    expect(effectBlock).toContain('setTab("ingresos")');
    // Nunca debe existir un setTab("conciliacion") — ese tab ya no existe.
    expect(effectBlock).not.toContain('setTab("conciliacion")');
  });

  it("preserva movementId de la URL antigua y lo pasa a la bandeja unificada", () => {
    const effectBlock = pageClient.match(/useEffect\(\(\) => \{\s*if \(deepLinkApplied[\s\S]*?\}, \[searchParams\]\);/)![0];
    expect(effectBlock).toContain('searchParams.get("movementId")');
    expect(effectBlock).toContain("setFocusMovementId(movementIdParam)");
  });

  it("BankIncomeWorkspace consume el foco vía prop (initialMovementId), sin endpoint de escritura nuevo", () => {
    expect(incomeWorkspace).toContain("initialMovementId");
    expect(incomeWorkspace).toContain("onInitialMovementConsumed");
  });

  it("el page client ya no tiene ningún setTab(\"conciliacion\") en ningún lugar (tab retirado)", () => {
    expect(pageClient).not.toContain('setTab("conciliacion")');
  });
});
