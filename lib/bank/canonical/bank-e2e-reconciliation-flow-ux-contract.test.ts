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
  it("tabs Banco sticky z-[70]; el drawer queda por encima (z-[80])", () => {
    expect(pageClient).toContain('data-bank-tabs');
    expect(pageClient).toContain("sticky top-0 z-[70]");
    expect(shell).toContain('zClassName = "z-[80]"');
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    const ids = [...tabsBlock.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["importar", "movimientos", "conciliacion", "historial"]);
  });

  it("drawers usan BankDrawerShell / offset solo topbar, no full-screen opaco", () => {
    expect(shell).toContain("pt-[3.25rem]");
    expect(shell).toContain("sm:pt-[3.5rem]");
    expect(shell).not.toContain("pt-[6.5rem]");
    expect(unified).toContain("BankDrawerShell");
    expect(pageClient).not.toMatch(/fixed inset-0 z-40 overflow-y-auto bg-\[var\(--copilot-card-bg\)\]/);
    expect(pageClient).not.toContain("BankIncomeWorkspace");
  });

  it("Cerrar visible al abrir: drawer por encima de tabs, sin hueco excesivo de tabs", () => {
    // FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001 — el backdrop
    // cubre las tabs; no hace falta un padding de tabs (~6.5 rem) para despejarlas.
    expect(shell).toContain("data-bank-drawer-backdrop");
    expect(shell).toMatch(/pt-\[3\.25rem\]/);
  });
});

describe("Foco exacto de movimiento", () => {
  // FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001 — el panel solo
  // monta en Conciliación; Movimientos navega con goToReconciliation.
  it("Asignación abre el panel solo en Conciliación con el movementId exacto", () => {
    expect(pageClient).toContain("SimpleMovementAssociationPanel");
    expect(pageClient).toContain("openSimpleAssociation");
    expect(pageClient).toContain('tab === "conciliacion" && simpleAssociationMovementId');
    expect(pageClient).toContain("goToReconciliation");
  });

  it("standalone: FocusedReceiptConfirmDrawer (código conservado, ya no montado por defecto) sigue apuntando a 1 movementId", () => {
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

describe("Un solo panel a la vez (FASE BANK-SIMPLE-FLOW-COMPLETION-001: un único drawer, sin estado cruzado posible)", () => {
  // Con un solo drawer (SimpleMovementAssociationPanel) controlado por un
  // único id de movimiento (simpleAssociationMovementId), no puede existir el
  // bug de dos drawers de movimientos distintos montados a la vez: abrir
  // uno nuevo siempre reemplaza el anterior (mismo setState), nunca los
  // acumula.
  it("un único estado (simpleAssociationMovementId) controla el único drawer de asociación", () => {
    const stateDecl = pageClient.match(/const \[simpleAssociationMovementId, setSimpleAssociationMovementId\] = useState<string \| null>\(null\);/);
    expect(stateDecl).not.toBeNull();
    expect(pageClient).toContain("const openSimpleAssociation = useCallback((movementId: string) => {");
  });

  it("abrir el panel para un movimiento siempre reemplaza cualquier apertura previa (mismo setState, no un mapa por id)", () => {
    expect(pageClient).toMatch(/setSimpleAssociationMovementId\(movementId\);\s*\}, \[\]\);/);
  });

  it("Conciliación abre el panel; Movimientos redirige a Conciliación con el mismo openSimpleAssociation", () => {
    expect(pageClient).toContain("onOpenAssociation={openSimpleAssociation}");
    expect(pageClient).toContain("goToReconciliation");
    expect(pageClient).toMatch(/setTab\("conciliacion"\);\s*openSimpleAssociation\(movementId\)/);
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
