import { describe, it, expect } from "vitest";

import { MODULE_KEYS, canReadModule, canAdminModule } from "@/lib/auth/module-permissions";
import { getDefaultPermissionsForRole } from "@/lib/auth/role-permission-presets";
import { resolveCopilotApiModuleKey } from "@/lib/auth/copilot-api-module-map";

describe("FASE9 ventas module wiring", () => {
  it("registers the ventas module key", () => {
    expect(MODULE_KEYS).toContain("ventas");
  });

  it("maps /api/copilot/sales/* to the ventas module", () => {
    expect(resolveCopilotApiModuleKey("/api/copilot/sales/overview")).toBe("ventas");
    expect(resolveCopilotApiModuleKey("/api/copilot/sales/catalog")).toBe("ventas");
    expect(resolveCopilotApiModuleKey("/api/copilot/sales/aliases")).toBe("ventas");
  });

  it("superadmin can read and admin ventas; usuario can read but not admin", () => {
    const superPerms = getDefaultPermissionsForRole("superadmin");
    expect(canReadModule("superadmin", superPerms, "ventas")).toBe(true);
    expect(canAdminModule("superadmin", superPerms, "ventas")).toBe(true);

    const userPerms = getDefaultPermissionsForRole("usuario");
    expect(canReadModule("usuario", userPerms, "ventas")).toBe(true);
    expect(canAdminModule("usuario", userPerms, "ventas")).toBe(false);
  });

  it("every role preset defines a ventas level", () => {
    for (const role of ["superadmin", "usuario", "cobranza", "tesoreria", "contador", "demo_readonly"]) {
      const perms = getDefaultPermissionsForRole(role);
      expect(perms.find((p) => p.moduleKey === "ventas")).toBeDefined();
    }
  });
});
