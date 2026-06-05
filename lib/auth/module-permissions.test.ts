import { describe, expect, it } from "vitest";

import {
  canAccessModule,
  canAdminModule,
  canReadModule,
  canWriteModule,
  getModuleAccessLevel,
  isValidAccessLevel,
  isValidModuleKey,
  resolveEffectivePermissions,
  type ModulePermission,
} from "@/lib/auth/module-permissions";
import {
  getDefaultPermissionsForRole,
} from "@/lib/auth/role-permission-presets";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function presetPerms(role: string): ModulePermission[] {
  return getDefaultPermissionsForRole(role);
}

function noOverrides(): ModulePermission[] {
  return [];
}

// ─── Resolución de permisos efectivos ────────────────────────────────────────

describe("resolveEffectivePermissions", () => {
  it("superadmin bypass: todos los módulos en admin", () => {
    const effective = resolveEffectivePermissions("superadmin", presetPerms("usuario"), noOverrides());
    effective.forEach((p) => {
      expect(p.accessLevel).toBe("admin");
    });
  });

  it("sin overrides usa el preset del rol", () => {
    const effective = resolveEffectivePermissions("cobranza", presetPerms("cobranza"), noOverrides());
    const acciones = effective.find((p) => p.moduleKey === "acciones");
    expect(acciones?.accessLevel).toBe("write");
  });

  it("override explícito tiene prioridad sobre preset", () => {
    const overrides: ModulePermission[] = [{ moduleKey: "tesoreria", accessLevel: "write" }];
    const effective = resolveEffectivePermissions("cobranza", presetPerms("cobranza"), overrides);
    const tesoreria = effective.find((p) => p.moduleKey === "tesoreria");
    expect(tesoreria?.accessLevel).toBe("write");
  });

  it("módulo sin override mantiene el valor del preset", () => {
    const overrides: ModulePermission[] = [{ moduleKey: "tesoreria", accessLevel: "write" }];
    const effective = resolveEffectivePermissions("contador", presetPerms("contador"), overrides);
    const admin = effective.find((p) => p.moduleKey === "admin");
    expect(admin?.accessLevel).toBe("none");
  });
});

// ─── canAccessModule ──────────────────────────────────────────────────────────

describe("canAccessModule", () => {
  it("superadmin puede acceder a todo", () => {
    const perms = resolveEffectivePermissions("superadmin", presetPerms("superadmin"), noOverrides());
    expect(canAccessModule("superadmin", perms, "admin")).toBe(true);
    expect(canAccessModule("superadmin", perms, "tesoreria")).toBe(true);
  });

  it("usuario puede acceder a módulos con read", () => {
    const perms = resolveEffectivePermissions("usuario", presetPerms("usuario"), noOverrides());
    expect(canAccessModule("usuario", perms, "hoy")).toBe(true);
    expect(canAccessModule("usuario", perms, "clientes")).toBe(true);
  });

  it("usuario NO puede acceder a admin", () => {
    const perms = resolveEffectivePermissions("usuario", presetPerms("usuario"), noOverrides());
    expect(canAccessModule("usuario", perms, "admin")).toBe(false);
  });

  it("demo_readonly igual que usuario", () => {
    const perms = resolveEffectivePermissions("demo_readonly", presetPerms("demo_readonly"), noOverrides());
    expect(canAccessModule("demo_readonly", perms, "reportes")).toBe(true);
    expect(canAccessModule("demo_readonly", perms, "admin")).toBe(false);
  });
});

// ─── canReadModule ────────────────────────────────────────────────────────────

describe("canReadModule", () => {
  it("superadmin puede leer todo", () => {
    const perms = resolveEffectivePermissions("superadmin", presetPerms("superadmin"), noOverrides());
    expect(canReadModule("superadmin", perms, "admin")).toBe(true);
  });

  it("contador puede leer finanzas y reportes", () => {
    const perms = resolveEffectivePermissions("contador", presetPerms("contador"), noOverrides());
    expect(canReadModule("contador", perms, "finanzas")).toBe(true);
    expect(canReadModule("contador", perms, "reportes")).toBe(true);
  });

  it("cobranza NO puede leer tesoreria (none)", () => {
    const perms = resolveEffectivePermissions("cobranza", presetPerms("cobranza"), noOverrides());
    expect(canReadModule("cobranza", perms, "tesoreria")).toBe(false);
  });
});

// ─── canWriteModule ───────────────────────────────────────────────────────────

describe("canWriteModule", () => {
  it("superadmin puede escribir en todo", () => {
    const perms = resolveEffectivePermissions("superadmin", presetPerms("superadmin"), noOverrides());
    expect(canWriteModule("superadmin", perms, "tesoreria")).toBe(true);
    expect(canWriteModule("superadmin", perms, "acciones")).toBe(true);
  });

  it("cobranza puede escribir acciones y clientes", () => {
    const perms = resolveEffectivePermissions("cobranza", presetPerms("cobranza"), noOverrides());
    expect(canWriteModule("cobranza", perms, "acciones")).toBe(true);
    expect(canWriteModule("cobranza", perms, "clientes")).toBe(true);
  });

  it("cobranza NO puede escribir tesoreria", () => {
    const perms = resolveEffectivePermissions("cobranza", presetPerms("cobranza"), noOverrides());
    expect(canWriteModule("cobranza", perms, "tesoreria")).toBe(false);
  });

  it("tesoreria puede escribir tesoreria", () => {
    const perms = resolveEffectivePermissions("tesoreria", presetPerms("tesoreria"), noOverrides());
    expect(canWriteModule("tesoreria", perms, "tesoreria")).toBe(true);
  });

  it("tesoreria NO puede escribir acciones", () => {
    const perms = resolveEffectivePermissions("tesoreria", presetPerms("tesoreria"), noOverrides());
    expect(canWriteModule("tesoreria", perms, "acciones")).toBe(false);
  });

  it("usuario NO puede escribir nada", () => {
    const perms = resolveEffectivePermissions("usuario", presetPerms("usuario"), noOverrides());
    expect(canWriteModule("usuario", perms, "hoy")).toBe(false);
    expect(canWriteModule("usuario", perms, "acciones")).toBe(false);
    expect(canWriteModule("usuario", perms, "tesoreria")).toBe(false);
  });

  it("demo_readonly NO puede escribir nada", () => {
    const perms = resolveEffectivePermissions("demo_readonly", presetPerms("demo_readonly"), noOverrides());
    expect(canWriteModule("demo_readonly", perms, "clientes")).toBe(false);
  });

  it("contador NO puede escribir (solo lectura)", () => {
    const perms = resolveEffectivePermissions("contador", presetPerms("contador"), noOverrides());
    expect(canWriteModule("contador", perms, "finanzas")).toBe(false);
    expect(canWriteModule("contador", perms, "reportes")).toBe(false);
  });
});

// ─── canAdminModule ───────────────────────────────────────────────────────────

describe("canAdminModule", () => {
  it("superadmin puede admin todo", () => {
    const perms = resolveEffectivePermissions("superadmin", presetPerms("superadmin"), noOverrides());
    expect(canAdminModule("superadmin", perms, "admin")).toBe(true);
    expect(canAdminModule("superadmin", perms, "tesoreria")).toBe(true);
  });

  it("ningún otro rol puede admin admin", () => {
    for (const role of ["usuario", "demo_readonly", "cobranza", "tesoreria", "contador"]) {
      const perms = resolveEffectivePermissions(role, presetPerms(role), noOverrides());
      expect(canAdminModule(role, perms, "admin")).toBe(false);
    }
  });

  it("tesoreria no tiene admin en tesoreria (solo write)", () => {
    const perms = resolveEffectivePermissions("tesoreria", presetPerms("tesoreria"), noOverrides());
    expect(canAdminModule("tesoreria", perms, "tesoreria")).toBe(false);
  });
});

// ─── Sidebar visibility ───────────────────────────────────────────────────────

describe("sidebar visibility (admin group)", () => {
  it("admin solo visible para superadmin", () => {
    const superPerms = resolveEffectivePermissions("superadmin", presetPerms("superadmin"), noOverrides());
    expect(canAccessModule("superadmin", superPerms, "admin")).toBe(true);

    const usuarioPerms = resolveEffectivePermissions("usuario", presetPerms("usuario"), noOverrides());
    expect(canAccessModule("usuario", usuarioPerms, "admin")).toBe(false);
  });

  it("módulo con none no aparece en sidebar", () => {
    const overrides: ModulePermission[] = [{ moduleKey: "tesoreria", accessLevel: "none" }];
    const perms = resolveEffectivePermissions("tesoreria", presetPerms("tesoreria"), overrides);
    expect(canAccessModule("tesoreria", perms, "tesoreria")).toBe(false);
  });

  it("todos los módulos son visibles para superadmin", () => {
    const perms = resolveEffectivePermissions("superadmin", presetPerms("superadmin"), noOverrides());
    const allVisible = perms.every((p) => p.accessLevel !== "none");
    expect(allVisible).toBe(true);
  });
});

// ─── isValidAccessLevel / isValidModuleKey ────────────────────────────────────

describe("validators", () => {
  it("isValidAccessLevel acepta valores válidos", () => {
    expect(isValidAccessLevel("none")).toBe(true);
    expect(isValidAccessLevel("read")).toBe(true);
    expect(isValidAccessLevel("write")).toBe(true);
    expect(isValidAccessLevel("admin")).toBe(true);
  });

  it("isValidAccessLevel rechaza inválidos", () => {
    expect(isValidAccessLevel("owner")).toBe(false);
    expect(isValidAccessLevel("")).toBe(false);
    expect(isValidAccessLevel(null)).toBe(false);
  });

  it("isValidModuleKey acepta módulos válidos", () => {
    expect(isValidModuleKey("hoy")).toBe(true);
    expect(isValidModuleKey("tesoreria")).toBe(true);
    expect(isValidModuleKey("admin")).toBe(true);
  });

  it("isValidModuleKey rechaza inválidos", () => {
    expect(isValidModuleKey("dashboard")).toBe(false);
    expect(isValidModuleKey("")).toBe(false);
    expect(isValidModuleKey(undefined)).toBe(false);
  });
});
