import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FASE BANK-END-TO-END-RECONCILIATION-FLOW-UX-CORRECTION-001 —
 * Contrato de navegación: tabs visibles, sin overlay full-screen que
 * reemplace Banco, foco exacto de movimiento, copy Nirmex correcto.
 */

const COMPONENTS = join(process.cwd(), "components", "copilot", "bank-movements");
const pageClient = readFileSync(join(COMPONENTS, "bank-movements-page-client.tsx"), "utf8");
const unified = readFileSync(join(COMPONENTS, "unified-reconciliation-workspace.tsx"), "utf8");
const focused = readFileSync(join(COMPONENTS, "focused-receipt-confirm-drawer.tsx"), "utf8");
const shell = readFileSync(join(COMPONENTS, "bank-drawer-shell.tsx"), "utf8");
const evidence = readFileSync(join(COMPONENTS, "canonical-evidence-ui.tsx"), "utf8");
const caseEngine = readFileSync(
  join(process.cwd(), "lib", "bank", "canonical", "unified-reconciliation-case.ts"),
  "utf8"
);

describe("Banco tabs y chrome", () => {
  it("tabs Banco sticky con z alto para permanecer visibles sobre drawers", () => {
    expect(pageClient).toContain('data-bank-tabs');
    expect(pageClient).toContain("sticky top-0 z-[70]");
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    const ids = [...tabsBlock.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["importar", "movimientos", "conciliacion", "historial"]);
  });

  it("drawers usan BankDrawerShell / offset bajo chrome, no full-screen opaco que oculte tabs", () => {
    expect(shell).toContain("pt-[3.25rem]");
    expect(unified).toContain("BankDrawerShell");
    expect(pageClient).not.toMatch(/fixed inset-0 z-40 overflow-y-auto bg-\[var\(--copilot-card-bg\)\]/);
    expect(pageClient).not.toContain("BankIncomeWorkspace");
  });
});

describe("Foco exacto de movimiento", () => {
  it("Identificar desde Movimientos preserva return + scroll y abre Conciliación", () => {
    expect(pageClient).toContain("returnToMovimientosRef");
    expect(pageClient).toContain("restoreMovimientosIfNeeded");
    expect(pageClient).toContain("savedScrollY");
    expect(pageClient).toContain("onCaseClosed={restoreMovimientosIfNeeded}");
    expect(pageClient).toContain("goToReconciliationForMovement");
  });

  it("Confirmar con recibo abre FocusedReceiptConfirmDrawer (1 movementId), no listado de pendientes", () => {
    expect(pageClient).toContain("FocusedReceiptConfirmDrawer");
    expect(focused).toContain("canonical-suggestions?workspace=income&movementIds=");
    expect(focused).toContain("Confirmar con recibo");
    expect(focused).not.toContain("status: \"pendientes\"");
    expect(unified).toContain("openReceiptWithHints(row.movementId)");
    expect(unified).toContain("data-focused-movement");
  });

  it("initialMovementId / initialClusterKey se consumen una vez vía token", () => {
    expect(unified).toContain("incomingFocusToken");
    expect(unified).toContain("appliedFocusToken");
    expect(unified).toContain("onInitialFocusConsumed");
    expect(unified).toContain("initialMovementId");
  });

  it("no usa Confirmar cliente en N cuando el cliente ya está identificado", () => {
    expect(unified).not.toContain("Confirmar cliente en ${");
    expect(unified).not.toContain("Confirmar cliente en ");
    expect(unified).toContain("Confirmar cliente");
    expect(unified).toContain("clientAlreadyIdentified");
  });

  it("lote de listos-para-confirmar dice 'Revisar N listos', nunca la CTA masiva 'Confirmar N con recibo' (FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001)", () => {
    expect(unified).toContain("Revisar {detail.batchEligibleMovementIds.length} listos");
    expect(unified).not.toMatch(/Confirmar \{[^}]*\}\s*con recibo/);
    expect(unified).not.toContain("Confirmar {detail.batchEligibleMovementIds.length} con recibo");
    expect(unified).toContain("startReviewQueue");
    expect(unified).toContain("reviewIndex");
  });
});

describe("Facturas y estados honestos", () => {
  it("factura sin aplicación Zeta usa copy honesto, no guión vacío (fuente: canonical-reconciliation-movement-view)", () => {
    const canonicalView = readFileSync(
      join(process.cwd(), "lib", "bank", "canonical", "canonical-reconciliation-movement-view.ts"),
      "utf8"
    );
    expect(caseEngine).toContain("deriveInvoiceContextKind");
    expect(caseEngine).toContain("invoiceContextLabel");
    expect(canonicalView).toContain(
      "Zeta no informa por API qué factura fue aplicada por este recibo."
    );
    expect(canonicalView).toContain('factura_pendiente: "Factura pendiente"');
    expect(canonicalView).toContain('factura_comprobada: "Factura comprobada"');
  });

  it("CTA final del evidence drawer dice Confirmar con recibo", () => {
    expect(evidence).toContain('confirmLabel = "Confirmar con recibo"');
  });

  it("acceso a ficha del cliente desde Conciliación", () => {
    expect(unified).toContain("Ver ficha del cliente");
    expect(unified).toContain("/copilot/clientes/");
  });
});
