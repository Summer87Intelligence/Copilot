import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — deep links antiguos
 * (ingresos / reconciliation / conciliacion) normalizan a Conciliación.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const incomeWorkspace = readFileSync(join(COMPONENTS_ROOT, "bank-income-workspace.tsx"), "utf8");

describe("Deep link: URLs antiguas normalizan a Conciliación", () => {
  it("reconoce tab=ingresos, reconciliation y conciliacion → setTab(conciliacion)", () => {
    const effectBlock = pageClient.match(/useEffect\(\(\) => \{\s*if \(deepLinkApplied[\s\S]*?\}, \[searchParams\]\);/)![0];
    expect(effectBlock).toContain('requestedTab === "ingresos"');
    expect(effectBlock).toContain('requestedTab === "reconciliation"');
    expect(effectBlock).toContain('requestedTab === "conciliacion"');
    expect(effectBlock).toContain('setTab("conciliacion")');
    expect(effectBlock).not.toContain('setTab("ingresos")');
  });

  it("preserva movementId", () => {
    const effectBlock = pageClient.match(/useEffect\(\(\) => \{\s*if \(deepLinkApplied[\s\S]*?\}, \[searchParams\]\);/)![0];
    expect(effectBlock).toContain('searchParams.get("movementId")');
    expect(effectBlock).toContain("setFocusMovementId(movementIdParam)");
  });

  it("BankIncomeWorkspace consume el foco vía initialMovementId", () => {
    expect(incomeWorkspace).toContain("initialMovementId");
    expect(incomeWorkspace).toContain("onInitialMovementConsumed");
  });
});
