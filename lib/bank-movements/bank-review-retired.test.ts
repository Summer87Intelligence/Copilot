import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COPILOT_NAV_ITEMS } from "@/components/copilot/copilot-nav-config";
import { resolveCopilotApiModuleKey } from "@/lib/auth/copilot-api-module-map";

/**
 * FASE BANK-SIMPLE-RECONCILIATION-RESTORE-001 — la superficie independiente
 * "Revisión bancaria" se retira de la experiencia activa; el flujo vuelve a Banco.
 * La infraestructura de DB e inteligencia queda inactiva (no se borra).
 */

const ROOT = process.cwd();

describe("Revisión bancaria retirada de la experiencia activa", () => {
  it("no hay item de navegación /copilot/revision-bancaria", () => {
    const hrefs = COPILOT_NAV_ITEMS.map((i) => i.href);
    expect(hrefs).not.toContain("/copilot/revision-bancaria");
  });

  it("Banco sigue en la navegación", () => {
    const hrefs = COPILOT_NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toContain("/copilot/movimientos-bancarios");
  });

  it("la página revision-bancaria ya no existe", () => {
    expect(existsSync(join(ROOT, "app/copilot/revision-bancaria/page.tsx"))).toBe(false);
  });

  it("las rutas API bank-review ya no existen", () => {
    expect(existsSync(join(ROOT, "app/api/copilot/bank-review"))).toBe(false);
  });

  it("los componentes y lib exclusivos de bank-review ya no existen", () => {
    expect(existsSync(join(ROOT, "components/copilot/bank-review"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/bank/review"))).toBe(false);
  });

  it("el mapa RBAC ya no clasifica /api/copilot/bank-review (sin ruta que clasificar)", () => {
    expect(resolveCopilotApiModuleKey("/api/copilot/bank-review/summary")).toBeNull();
    // La ruta de Banco sigue mapeada al módulo bank_movements.
    expect(resolveCopilotApiModuleKey("/api/copilot/bank-movements")).toBe("bank_movements");
  });

  it("la infraestructura de DB/migraciones NO se borra (queda inactiva)", () => {
    expect(existsSync(join(ROOT, "supabase/migrations/20260721120000_bank_review_actions.sql"))).toBe(true);
    expect(existsSync(join(ROOT, "supabase/migrations/20260720120000_bank_suggestion_scope.sql"))).toBe(true);
    // El motor shadow queda como infraestructura inactiva (no se elimina).
    expect(existsSync(join(ROOT, "lib/bank/intelligence/server/runner.ts"))).toBe(true);
  });
});
