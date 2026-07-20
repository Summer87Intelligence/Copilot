import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 — contrato estático
 * sobre el código fuente (el proyecto no usa @testing-library/react; mismo
 * patrón que `seller-assignment-ux-contract.test.ts`).
 *
 * Reemplaza el contrato de BANK-RECONCILIATION-CANONICAL-ENGINE-001: la
 * pestaña Conciliación independiente fue absorbida por Ingresos (única
 * bandeja operativa diaria). Sigue bloqueando la regresión de fondo: Motor D
 * (canónico) es la única fuente de conciliación, Motor C (legacy) no puede
 * escribir por ningún camino, y Motor A (Tesorería) no vuelve a aparecer como
 * "Conciliar" dentro del flujo de cobros.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const API_ROOT = join(process.cwd(), "app", "api", "copilot", "bank-movements");

const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const treasuryPanel = readFileSync(join(COMPONENTS_ROOT, "bank-movements-reconciliation-panel.tsx"), "utf8");
const legacyDrawer = readFileSync(join(COMPONENTS_ROOT, "bank-movement-reconciliation-drawer.tsx"), "utf8");
const incomeWorkspace = readFileSync(join(COMPONENTS_ROOT, "bank-income-workspace.tsx"), "utf8");
const evidenceUi = readFileSync(join(COMPONENTS_ROOT, "canonical-evidence-ui.tsx"), "utf8");
const legacyLinksRoute = readFileSync(join(API_ROOT, "[id]", "reconciliation-links", "route.ts"), "utf8");
const legacyLinkByIdRoute = readFileSync(join(API_ROOT, "[id]", "reconciliation-links", "[linkId]", "route.ts"), "utf8");
const canonicalRoute = readFileSync(join(API_ROOT, "canonical-suggestions", "route.ts"), "utf8");

describe("Navegación: 4 tabs, sin pestaña Conciliación independiente", () => {
  it("TABS mantiene exactamente Importar/Movimientos/Ingresos/Historial en ese orden", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    const ids = [...tabsBlock.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["importar", "movimientos", "ingresos", "historial"]);
  });

  it("no existe ningún tab 'conciliacion'", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    expect(tabsBlock).not.toContain('"conciliacion"');
  });

  it("Ingresos está marcada como la bandeja diaria principal (primary)", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    expect(tabsBlock).toMatch(/id:\s*"ingresos",\s*label:\s*"Ingresos",\s*primary:\s*true/);
  });

  it("BankTab ya no incluye 'conciliacion' como valor posible", () => {
    const typeLine = pageClient.match(/type BankTab = [^;]+;/)![0];
    expect(typeLine).not.toContain("conciliacion");
  });
});

describe("Ingresos (única bandeja diaria) consume ÚNICAMENTE el motor canónico (D)", () => {
  it("el tab 'ingresos' monta BankIncomeWorkspace, no el panel legacy de asociación aislado ni el de Tesorería", () => {
    expect(pageClient).toMatch(/tab === "ingresos" \? \(\s*<BankIncomeWorkspace/);
  });

  it("BankMovementsReconciliationPanel (Motor A) no se monta bajo el tab de ingresos", () => {
    const ingresosBlock = pageClient.split('tab === "ingresos"')[1] ?? "";
    expect(ingresosBlock.slice(0, 200)).not.toContain("BankMovementsReconciliationPanel");
  });

  it("BankIncomeWorkspace lee /api/copilot/bank-movements/canonical-suggestions y solo escribe hacia /api/copilot/bank-reconciliation/ (confirm/reject canónicos), vía las funciones compartidas de canonical-evidence-ui", () => {
    expect(incomeWorkspace).toContain("/api/copilot/bank-movements/canonical-suggestions");
    expect(incomeWorkspace).toContain("confirmCanonicalEvidence");
    expect(incomeWorkspace).toContain("rejectCanonicalEvidence");
    expect(incomeWorkspace).not.toContain("reconciliation-links");
    // La única escritura financiera nueva (Motor D) vive en canonical-evidence-ui.tsx, reusada acá.
    const postJsonCalls = [...evidenceUi.matchAll(/postJson\(`([^`]+)`/g)].map((m) => m[1]);
    expect(postJsonCalls.length).toBeGreaterThan(0);
    for (const url of postJsonCalls) {
      expect(url).toMatch(/^\/api\/copilot\/bank-reconciliation\/\$\{[^}]+\}\/(confirm|reject)$/);
    }
    const rawPostFetches = [...evidenceUi.matchAll(/method:\s*"POST"/g)];
    expect(rawPostFetches.length).toBe(1);
  });

  it("Motor B (identificación preliminar) sigue presente pero no compite con la evidencia canónica: solo se muestra cuando no hay sugerencia del motor D", () => {
    expect(incomeWorkspace).toContain("income-suggestions");
    expect(incomeWorkspace).toContain("income-match");
    expect(incomeWorkspace).toContain("PreliminaryIdentification");
    // El bloque de Motor B solo se monta en el branch "sin evidencia canónica".
    expect(incomeWorkspace).toMatch(/evidence \? \([\s\S]*?\) : view\.status === "ignorado" \? \([\s\S]*?\) : \(\s*<PreliminaryIdentification/);
  });

  it("el endpoint canónico sigue exponiendo solo GET (lectura), con el nuevo modo workspace=income/history", () => {
    expect(canonicalRoute).toContain("listCanonicalOperationalEvidence");
    expect(canonicalRoute).toContain("export async function GET");
    expect(canonicalRoute).not.toMatch(/export async function (POST|PATCH|DELETE)/);
    expect(canonicalRoute).toContain('params.get("workspace") === "income"');
    expect(canonicalRoute).toContain('params.get("workspace") === "history"');
  });
});

describe("Motor A (Tesorería): renombrado y fuera del flujo de cobros de clientes", () => {
  it("ya no usa la etiqueta ambigua 'Conciliar' para pagos programados", () => {
    expect(treasuryPanel).not.toMatch(/>\s*Conciliar\s*</);
    expect(treasuryPanel).toContain("Vincular con pago programado");
  });

  it("su copy aclara que no es la conciliación de cobros de clientes", () => {
    expect(treasuryPanel).toContain("Pagos programados de Tesorería");
  });

  it("se monta dentro de Movimientos como sección secundaria (details colapsado), no en Ingresos", () => {
    const detailsIdx = pageClient.indexOf("Pagos programados de Tesorería");
    const panelIdx = pageClient.indexOf("<BankMovementsReconciliationPanel");
    const ingresosIdx = pageClient.indexOf('{tab === "ingresos"');
    expect(detailsIdx).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(detailsIdx);
    expect(panelIdx).toBeLessThan(ingresosIdx);
  });
});

describe("Motor C (legacy): retirado como escritor, en toda capa", () => {
  it("el drawer detallado no llama a ningún método de escritura (POST/DELETE) hacia reconciliation-links", () => {
    expect(legacyDrawer).not.toMatch(/method:\s*["']POST["']/);
    expect(legacyDrawer).not.toMatch(/method:\s*["']DELETE["']/);
    expect(legacyDrawer).not.toContain("applySuggestion");
    expect(legacyDrawer).not.toContain("undoLink");
    expect(legacyDrawer).not.toContain("markIgnored");
  });

  it("el drawer avisa explícitamente que quedó de solo lectura", () => {
    expect(legacyDrawer).toMatch(/solo lectura/);
  });

  it("POST a reconciliation-links está retirado server-side (410), no solo oculto en la UI", () => {
    expect(legacyLinksRoute).toContain("LEGACY_WRITE_RETIRED");
    expect(legacyLinksRoute).toMatch(/status:\s*410/);
    expect(legacyLinksRoute).not.toContain("createReconciliationLink");
    expect(legacyLinksRoute).toContain("requireCopilotModuleWriteAccess");
  });

  it("GET a reconciliation-links se conserva (lectura del drawer sigue funcionando)", () => {
    expect(legacyLinksRoute).toContain("export async function GET(");
    expect(legacyLinksRoute).toContain("getMovementReconciliationView");
  });

  it("DELETE a reconciliation-links/[linkId] está retirado server-side (410), pero conserva la validación RBAC", () => {
    expect(legacyLinkByIdRoute).toContain("LEGACY_WRITE_RETIRED");
    expect(legacyLinkByIdRoute).toMatch(/status:\s*410/);
    expect(legacyLinkByIdRoute).not.toContain("archiveReconciliationLink");
    expect(legacyLinkByIdRoute).toContain("requireCopilotModuleWriteAccess");
  });
});
