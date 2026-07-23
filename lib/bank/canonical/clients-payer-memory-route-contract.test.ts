import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regresión: Next.js 16 no permite `[companyId]` y `[id]` como siblings
 * bajo `app/api/copilot/clients/`. `payer-memory` vive en `[id]`; la URL
 * pública `/api/copilot/clients/:uuid/payer-memory` no cambia.
 */

const ROOT = process.cwd();
const underId = join(ROOT, "app", "api", "copilot", "clients", "[id]", "payer-memory", "route.ts");
const underCompanyId = join(
  ROOT,
  "app",
  "api",
  "copilot",
  "clients",
  "[companyId]",
  "payer-memory",
  "route.ts"
);
const caller = join(ROOT, "components", "copilot", "clients", "client-payer-memory-section.tsx");

describe("clients payer-memory route — slug contract", () => {
  it("vive bajo [id], no bajo [companyId]", () => {
    expect(existsSync(underId)).toBe(true);
    expect(existsSync(underCompanyId)).toBe(false);
  });

  it("expone params.id y conserva la URL pública /api/copilot/clients/${id}/payer-memory", () => {
    const route = readFileSync(underId, "utf8");
    expect(route).toContain("params: Promise<{ id: string }>");
    expect(route).toContain("const { id: companyId } = await params");

    const ui = readFileSync(caller, "utf8");
    expect(ui).toContain("`/api/copilot/clients/${companyId}/payer-memory`");
  });

  it("API y UI separan resumen activo, historial y correcciones", () => {
    const route = readFileSync(underId, "utf8");
    expect(route).toContain("activeHistory");
    expect(route).toContain("correctionsGrouped");
    expect(route).toContain("habitualPayment");
    expect(route).toContain("howAppears");

    const ui = readFileSync(caller, "utf8");
    expect(ui).toContain("data-client-banking-summary");
    expect(ui).toContain("data-client-banking-active-history");
    expect(ui).toContain("data-client-banking-corrections");
    expect(ui).toContain("data-client-banking-habitual");
    expect(ui).toContain("buildBankMovementConsultHref");
  });
});
