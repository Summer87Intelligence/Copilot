import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FASE BANK-UNIFIED-RECONCILIATION-CORRECTION-AND-MOVEMENT-VISIBILITY-001 —
 * "Identificar cliente" desde Movimientos debe abrir Conciliación unificada
 * (cluster/movimiento), no una página legacy fullscreen como flujo principal.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const unified = readFileSync(join(COMPONENTS_ROOT, "unified-reconciliation-workspace.tsx"), "utf8");

describe("Movimientos → Conciliación unificada (deep-link)", () => {
  it("goToReconciliationForMovement deriva cluster y abre Conciliación, no BankIncome como destino principal", () => {
    expect(pageClient).toContain("goToReconciliationForMovement");
    expect(pageClient).toContain("derivePayerClusterKey");
    expect(pageClient).toContain("setFocusClusterKey");
    expect(pageClient).toContain('setTab("conciliacion")');
    expect(pageClient).toContain("initialClusterKey={focusClusterKey}");
    expect(pageClient).toContain("initialMovementId={focusMovementId}");
    // BankIncomeWorkspace solo vía receiptFocusMovementId (vincular recibo contextual).
    expect(pageClient).toContain("receiptFocusMovementId");
    expect(pageClient).toContain("setReceiptFocusMovementId");
    expect(pageClient).not.toMatch(/goToReconciliationForMovement[\s\S]{0,400}setReceiptFocusMovementId/);
  });

  it("Identificar cliente no hace router.push a ruta legacy", () => {
    expect(pageClient).not.toMatch(/router\.(push|replace)\([^)]*identificar/i);
    expect(pageClient).not.toMatch(/router\.(push|replace)\([^)]*manual-draft/i);
    expect(pageClient).not.toContain("/copilot/bank-income");
  });

  it("salidas no entran al flujo de ingresos unificado", () => {
    expect(pageClient).toContain('m.direction !== "inflow"');
    expect(pageClient).toContain("setTesoreriaOpen(true)");
    expect(pageClient).toContain("Vincular con pago programado");
  });

  it("duplicados no ofrecen Identificar cliente operativo", () => {
    expect(pageClient).toContain("movementDuplicates[m.id]");
    expect(pageClient).toContain("DUPLICATE_OF_IMPORT_LABEL");
  });

  it("UnifiedReconciliationWorkspace acepta foco inicial de cluster/movimiento", () => {
    expect(unified).toContain("initialClusterKey");
    expect(unified).toContain("initialMovementId");
    expect(unified).toContain("highlightMovementId");
    expect(unified).not.toContain("onOpenReceipt(initialMovementId)");
  });

  it("ocultar/mostrar y filtro de visibilidad están cableados", () => {
    expect(pageClient).toContain("Ocultar");
    expect(pageClient).toContain("Volver a mostrar");
    expect(pageClient).toContain("/hide");
    expect(pageClient).toContain("/restore");
    expect(pageClient).toContain("canManageVisibility={canWriteBank}");
    expect(pageClient).toContain('modulePermissions["bank_movements"]');
  });
});
