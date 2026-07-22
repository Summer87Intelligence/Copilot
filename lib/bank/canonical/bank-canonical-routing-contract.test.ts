import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — contrato estático
 * de navegación final: Importar · Movimientos · Conciliación · Historial.
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

describe("Navegación: 4 tabs, sin pestaña Ingresos", () => {
  it("TABS mantiene exactamente Importar/Movimientos/Conciliación/Historial", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    const ids = [...tabsBlock.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["importar", "movimientos", "conciliacion", "historial"]);
  });

  it("no existe ningún tab 'ingresos' en TABS", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    expect(tabsBlock).not.toContain('"ingresos"');
  });

  it("Conciliación está marcada como bandeja diaria principal (primary)", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    expect(tabsBlock).toMatch(/id:\s*"conciliacion",\s*label:\s*"Conciliación",\s*primary:\s*true/);
  });

  it("BankTab incluye conciliacion y no ingresos", () => {
    const typeLine = pageClient.match(/type BankTab = [^;]+;/)![0];
    expect(typeLine).toContain("conciliacion");
    expect(typeLine).not.toContain("ingresos");
  });
});

describe("Deep links preservan movementId y normalizan URLs antiguas", () => {
  it("normaliza ingresos/reconciliation/conciliacion a Conciliación", () => {
    expect(pageClient).toContain('requestedTab === "ingresos"');
    expect(pageClient).toContain('requestedTab === "reconciliation"');
    expect(pageClient).toContain('requestedTab === "conciliacion"');
    expect(pageClient).toContain('setTab("conciliacion")');
  });

  it("preserva movementId al enfocar", () => {
    expect(pageClient).toContain("setFocusMovementId(movementIdParam)");
  });
});

describe("Movimientos: sin writer directo a matched", () => {
  it("entradas usan Revisar conciliación", () => {
    expect(pageClient).toContain("Revisar conciliación");
    expect(pageClient).toContain("goToReconciliationForMovement");
  });

  it("salidas usan Vincular con pago programado", () => {
    expect(pageClient).toContain("Vincular con pago programado");
  });

  it("no hay botón genérico Conciliar que llame changeStatus(..., matched)", () => {
    expect(pageClient).not.toMatch(/changeStatus\(m,\s*"matched"\)/);
  });

  it("Historial no muestra KPIs operativos", () => {
    expect(pageClient).toContain('tab !== "historial"');
  });
});

describe("Conciliación consume ÚNICAMENTE el motor canónico (D)", () => {
  // FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001 — reemplazó las dos
  // sub-vistas visibles ("Identificar clientes"/"Vincular recibos") por una
  // única vista (UnifiedReconciliationWorkspace); los dos motores existentes
  // (identificación en lote, confirmación de recibo enfocada) se reusan sin
  // cambios, ahora como acciones contextuales (ClusterReviewDrawer /
  // FocusedReceiptConfirmDrawer) en vez de pestañas que el usuario deba elegir.
  it("el tab 'conciliacion' monta la vista unificada y reusa los motores existentes como acciones contextuales", () => {
    expect(pageClient).toMatch(/tab === "conciliacion" \? \(/);
    expect(pageClient).toContain("UnifiedReconciliationWorkspace");
    expect(pageClient).toContain("ClusterReviewDrawer");
    expect(pageClient).toContain("FocusedReceiptConfirmDrawer");
    expect(pageClient).not.toContain("BankClientIdentificationWorkspace");
  });

  it("BankMovementsReconciliationPanel (Motor A) no se monta bajo Conciliación", () => {
    const block = pageClient.split('tab === "conciliacion"')[1] ?? "";
    expect(block.slice(0, 2000)).not.toContain("BankMovementsReconciliationPanel");
  });

  it("escrituras financieras solo vía confirm/reject canónicos", () => {
    expect(incomeWorkspace).toContain("/api/copilot/bank-movements/canonical-suggestions");
    expect(incomeWorkspace).toContain("confirmCanonicalEvidence");
    expect(incomeWorkspace).toContain("rejectCanonicalEvidence");
    expect(incomeWorkspace).toContain("/api/copilot/bank-reconciliation/manual-draft");
    expect(incomeWorkspace).toContain("Buscar cliente y recibo");
    const postJsonCalls = [...evidenceUi.matchAll(/postJson\(`([^`]+)`/g)].map((m) => m[1]);
    expect(postJsonCalls.length).toBeGreaterThan(0);
    for (const url of postJsonCalls) {
      expect(url).toMatch(/^\/api\/copilot\/bank-reconciliation\/\$\{[^}]+\}\/(confirm|reject)$/);
    }
  });

  it("Motor B queda como ayuda visual colapsada, no como flujo principal", () => {
    expect(incomeWorkspace).toContain("PreliminaryIdentification");
    expect(incomeWorkspace).toContain("Ayuda visual (identificación preliminar)");
    expect(incomeWorkspace).toContain("Buscar cliente y recibo");
  });

  it("el endpoint canónico sigue exponiendo solo GET", () => {
    expect(canonicalRoute).toContain("listCanonicalOperationalEvidence");
    expect(canonicalRoute).toContain("export async function GET");
    expect(canonicalRoute).not.toMatch(/export async function (POST|PATCH|DELETE)/);
  });
});

describe("Motor A (Tesorería): fuera del flujo de cobros", () => {
  it("ya no usa la etiqueta ambigua 'Conciliar' para pagos programados", () => {
    expect(treasuryPanel).not.toMatch(/>\s*Conciliar\s*</);
    expect(treasuryPanel).toContain("Vincular con pago programado");
  });

  it("se monta dentro de Movimientos, no en Conciliación", () => {
    const detailsIdx = pageClient.indexOf("Pagos programados de Tesorería");
    const panelIdx = pageClient.indexOf("<BankMovementsReconciliationPanel");
    const concIdx = pageClient.indexOf('{tab === "conciliacion"');
    expect(detailsIdx).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(detailsIdx);
    expect(panelIdx).toBeLessThan(concIdx);
  });
});

describe("Motor C (legacy): retirado como escritor", () => {
  it("el drawer detallado no llama a ningún método de escritura hacia reconciliation-links", () => {
    expect(legacyDrawer).not.toMatch(/method:\s*["']POST["']/);
    expect(legacyDrawer).not.toMatch(/method:\s*["']DELETE["']/);
  });

  it("POST a reconciliation-links está retirado server-side (410)", () => {
    expect(legacyLinksRoute).toContain("LEGACY_WRITE_RETIRED");
    expect(legacyLinksRoute).toMatch(/status:\s*410/);
  });

  it("DELETE a reconciliation-links/[linkId] está retirado server-side (410)", () => {
    expect(legacyLinkByIdRoute).toContain("LEGACY_WRITE_RETIRED");
    expect(legacyLinkByIdRoute).toMatch(/status:\s*410/);
  });
});
