import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — deep links antiguos
 * (ingresos / reconciliation / conciliacion) normalizan a Conciliación.
 *
 * FASE BANK-ASSOCIATION-DRAWER-SCROLL-ANCHOR-FIX-002 — el tab se aplica una
 * sola vez; `movementId` reacciona a cambios de URL (soft navigation).
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const incomeWorkspace = readFileSync(join(COMPONENTS_ROOT, "bank-income-workspace.tsx"), "utf8");

describe("Deep link: URLs antiguas normalizan a Conciliación", () => {
  it("reconoce tab=ingresos, reconciliation y conciliacion → setTab(conciliacion)", () => {
    expect(pageClient).toContain('requestedTab === "ingresos"');
    expect(pageClient).toContain('requestedTab === "reconciliation"');
    expect(pageClient).toContain('requestedTab === "conciliacion"');
    expect(pageClient).toContain('setTab("conciliacion")');
    expect(pageClient).not.toContain('setTab("ingresos")');
    expect(pageClient).toContain("if (!deepLinkApplied.current)");
  });

  it("preserva movementId: Conciliación abre panel; Movimientos+consult solo resalta", () => {
    expect(pageClient).toContain('searchParams.get("movementId")');
    expect(pageClient).toContain("openSimpleAssociation(movementIdParam)");
    expect(pageClient).toContain('searchParams.get("view") === "consult"');
    expect(pageClient).toContain("setHighlightMovementId(movementIdParam)");
    expect(pageClient).toContain('setTab("movimientos")');
  });

  it("BankIncomeWorkspace consume el foco vía initialMovementId", () => {
    expect(incomeWorkspace).toContain("initialMovementId");
    expect(incomeWorkspace).toContain("onInitialMovementConsumed");
  });
});
