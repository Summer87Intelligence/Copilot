import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001
 */
const page = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "bank-movements-page-client.tsx"),
  "utf8"
);
const list = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "simple-reconciliation-list.tsx"),
  "utf8"
);
const panel = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "simple-movement-association-panel.tsx"),
  "utf8"
);
const shell = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "bank-drawer-shell.tsx"),
  "utf8"
);

describe("Separación Movimientos / Conciliación", () => {
  it("Movimientos no ofrece Asignar cliente ni abre el panel de asignación", () => {
    expect(page).toContain("Ir a Conciliación");
    expect(page).toContain("data-bank-go-to-reconciliation");
    expect(page).toContain('tab === "conciliacion" && simpleAssociationMovementId');
    // El string "Asignar cliente" no debe aparecer en el render de acciones de Movimientos
    // (sí puede existir en Conciliación vía SimpleReconciliationList).
    const actionsBlock = page.slice(
      page.indexOf("const renderMovementActions"),
      page.indexOf("const movementColumns")
    );
    expect(actionsBlock).not.toContain("Asignar cliente");
    expect(actionsBlock).not.toContain("Confirmar asociación");
    expect(actionsBlock).not.toContain("Cambiar cliente");
    expect(actionsBlock).not.toContain("Revocar asociación");
  });

  it("Conciliación mantiene Asignar cliente / Ver asociación", () => {
    expect(list).toContain("SIMPLE_MOVEMENT_STATE_ACTION_LABEL");
    expect(list).toContain("onOpenAssociation");
    expect(list).toContain("getBankMovementDisplayDescription");
    expect(list).not.toContain("truncate");
    const labels = readFileSync(
      join(process.cwd(), "lib", "bank-movements", "simple-movement-association.ts"),
      "utf8"
    );
    expect(labels).toContain('sin_cliente: "Asignar cliente"');
    expect(labels).toContain('asociado: "Ver asociación"');
  });

  it("panel usa descripción canónica completa y close selector", () => {
    expect(panel).toContain("getBankMovementDisplayDescription");
    expect(panel).toContain("BANK_MOVEMENT_DESCRIPTION_CLASS");
    expect(panel).toContain("data-bank-drawer-close");
    expect(panel).toContain("Descripción Santander");
    expect(panel).not.toContain("truncate");
  });

  it("drawer por encima de tabs sticky", () => {
    expect(shell).toContain('zClassName = "z-[80]"');
    expect(shell).toContain("data-bank-drawer");
    expect(page).toContain("data-bank-tabs");
    expect(page).toContain("z-[70]");
  });
});
