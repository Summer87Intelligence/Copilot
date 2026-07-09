import { describe, expect, it } from "vitest";

import { resolveCopilotApiModuleKey } from "@/lib/auth/copilot-api-module-map";
import { isValidModuleKey, MODULE_KEYS } from "@/lib/auth/module-permissions";
import {
  getDefaultAccessLevel,
  getDefaultPermissionsForRole,
  SUPPORTED_ROLES,
} from "@/lib/auth/role-permission-presets";

describe("module keys de bank_movements y daily_tasks", () => {
  it("existen en MODULE_KEYS", () => {
    expect(MODULE_KEYS).toContain("bank_movements");
    expect(MODULE_KEYS).toContain("daily_tasks");
    expect(isValidModuleKey("bank_movements")).toBe(true);
    expect(isValidModuleKey("daily_tasks")).toBe(true);
  });

  it("todos los presets de rol incluyen ambos módulos", () => {
    for (const role of SUPPORTED_ROLES) {
      const perms = getDefaultPermissionsForRole(role);
      const keys = perms.map((p) => p.moduleKey);
      expect(keys).toContain("bank_movements");
      expect(keys).toContain("daily_tasks");
    }
  });

  it("presets recomendados por rol", () => {
    expect(getDefaultAccessLevel("superadmin", "bank_movements")).toBe("admin");
    expect(getDefaultAccessLevel("superadmin", "daily_tasks")).toBe("admin");
    expect(getDefaultAccessLevel("usuario", "bank_movements")).toBe("none");
    expect(getDefaultAccessLevel("usuario", "daily_tasks")).toBe("write");
    expect(getDefaultAccessLevel("cobranza", "bank_movements")).toBe("none");
    expect(getDefaultAccessLevel("cobranza", "daily_tasks")).toBe("write");
    expect(getDefaultAccessLevel("tesoreria", "bank_movements")).toBe("write");
    expect(getDefaultAccessLevel("tesoreria", "daily_tasks")).toBe("write");
    expect(getDefaultAccessLevel("contador", "bank_movements")).toBe("read");
    expect(getDefaultAccessLevel("contador", "daily_tasks")).toBe("write");
  });
});

describe("mapa API → module_key", () => {
  it("rutas de bank-movements resuelven a bank_movements", () => {
    expect(resolveCopilotApiModuleKey("/api/copilot/bank-movements")).toBe("bank_movements");
    expect(resolveCopilotApiModuleKey("/api/copilot/bank-movements/imports")).toBe(
      "bank_movements"
    );
    expect(
      resolveCopilotApiModuleKey(
        "/api/copilot/bank-movements/00000000-0000-0000-0000-000000000000/suggestions"
      )
    ).toBe("bank_movements");
  });

  it("rutas de daily-tasks resuelven a daily_tasks", () => {
    expect(resolveCopilotApiModuleKey("/api/copilot/daily-tasks")).toBe("daily_tasks");
  });
});
