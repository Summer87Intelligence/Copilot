import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — contrato estático sobre el
 * código fuente (el proyecto no usa @testing-library/react; mismo patrón que
 * `seller-assignment-ux-contract.test.ts`).
 *
 * Bloquea la regresión de fondo de esta fase: Motor D (canónico) debe ser la
 * única fuente de la pestaña Conciliación, Motor C (legacy) no debe poder
 * escribir por ningún camino (ni UI ni API directa), y Motor A (Tesorería) no
 * debe volver a aparecer como "Conciliar" dentro del flujo de cobros.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const API_ROOT = join(process.cwd(), "app", "api", "copilot", "bank-movements");

const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const treasuryPanel = readFileSync(join(COMPONENTS_ROOT, "bank-movements-reconciliation-panel.tsx"), "utf8");
const legacyDrawer = readFileSync(join(COMPONENTS_ROOT, "bank-movement-reconciliation-drawer.tsx"), "utf8");
const canonicalPanel = readFileSync(join(COMPONENTS_ROOT, "bank-canonical-reconciliation-panel.tsx"), "utf8");
const legacyLinksRoute = readFileSync(join(API_ROOT, "[id]", "reconciliation-links", "route.ts"), "utf8");
const legacyLinkByIdRoute = readFileSync(join(API_ROOT, "[id]", "reconciliation-links", "[linkId]", "route.ts"), "utf8");
const canonicalRoute = readFileSync(join(API_ROOT, "canonical-suggestions", "route.ts"), "utf8");

describe("Navegación: 5 tabs, orden diario, Conciliación destacada", () => {
  it("TABS mantiene exactamente Importar/Movimientos/Ingresos/Conciliación/Historial en ese orden", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    const ids = [...tabsBlock.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["importar", "movimientos", "ingresos", "conciliacion", "historial"]);
  });

  it("Conciliación está marcada como acción diaria principal (primary)", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    expect(tabsBlock).toMatch(/id:\s*"conciliacion",\s*label:\s*"Conciliación",\s*primary:\s*true/);
  });
});

describe("Conciliación (tab) consume ÚNICAMENTE el motor canónico (D)", () => {
  it("el tab 'conciliacion' monta BankCanonicalReconciliationPanel, no el panel legacy de Tesorería", () => {
    expect(pageClient).toMatch(/tab === "conciliacion" \? <BankCanonicalReconciliationPanel \/> : null/);
  });

  it("BankMovementsReconciliationPanel (Motor A) ya no se monta bajo el tab de conciliación", () => {
    const conciliacionBlock = pageClient.split('tab === "conciliacion"')[1] ?? "";
    expect(conciliacionBlock.slice(0, 80)).not.toContain("BankMovementsReconciliationPanel");
  });

  it("el panel canónico solo lee /api/copilot/bank-movements/canonical-suggestions (sin escribir nada)", () => {
    expect(canonicalPanel).toContain("/api/copilot/bank-movements/canonical-suggestions");
    expect(canonicalPanel).not.toMatch(/method:\s*["'](POST|PATCH|DELETE)["']/);
  });

  it("el endpoint canónico usa listCanonicalOperationalEvidence (scope operational) y solo expone GET", () => {
    expect(canonicalRoute).toContain("listCanonicalOperationalEvidence");
    expect(canonicalRoute).toContain("export async function GET");
    expect(canonicalRoute).not.toMatch(/export async function (POST|PATCH|DELETE)/);
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

  it("se monta dentro de Movimientos como sección secundaria (details colapsado), no en Conciliación", () => {
    const detailsIdx = pageClient.indexOf("Pagos programados de Tesorería");
    const panelIdx = pageClient.indexOf("<BankMovementsReconciliationPanel");
    const conciliacionIdx = pageClient.indexOf('{tab === "conciliacion"');
    expect(detailsIdx).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(detailsIdx);
    expect(panelIdx).toBeLessThan(conciliacionIdx);
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
