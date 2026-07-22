import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canReadModule,
  canWriteModule,
  resolveEffectivePermissions,
  MODULE_KEYS,
} from "@/lib/auth/module-permissions";
import { getDefaultPermissionsForRole, getDefaultAccessLevel } from "@/lib/auth/role-permission-presets";

/**
 * RBAC-BANK-ACCESS-URGENT-FIX-001
 *
 * Bug reproducido en producción: un admin habilitaba Banco (read/write) para
 * un usuario de rol `usuario`/`cobranza` desde Configuración — el override se
 * persistía correctamente en app_user_permissions — pero proxy.ts (Edge)
 * bloqueaba igual la ruta /copilot/movimientos-bancarios porque su guard de
 * módulo comparaba únicamente contra el preset del rol (getDefaultAccessLevel),
 * nunca contra los overrides de DB. Redirigía a /copilot/tareas-diarias
 * (?blocked=module-access), el mismo destino que resulta de landing con el
 * preset roto.
 *
 * Fix: proxy.ts ya no bloquea rutas de módulo por preset. Cada página bajo
 * /copilot/* resuelve su propio guard server-side contra permisos efectivos
 * reales (preset + overrides DB) vía isModuleAccessDenied() /
 * getServerEffectivePermissions() — única fuente de verdad.
 */

const PROXY_SOURCE = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

const CANONICAL_BANK_KEY = "bank_movements";
const LEGACY_BANK_KEYS = ["banco", "movimientos_bancarios", "movimientos-bancarios", "bank"];

describe("proxy.ts ya no bloquea rutas de módulo contra el preset del rol", () => {
  it("no importa ni usa getDefaultAccessLevel (fuente del bug: preset-only, sin DB overrides)", () => {
    expect(PROXY_SOURCE).not.toContain("getDefaultAccessLevel");
  });

  it("no queda ningún redirect con blocked=module-access (el guard removido)", () => {
    expect(PROXY_SOURCE).not.toContain("module-access");
  });

  it("no queda COPILOT_MODULE_ROUTE_PREFIXES ni getModuleKeyForPath (dead code del guard removido)", () => {
    expect(PROXY_SOURCE).not.toContain("COPILOT_MODULE_ROUTE_PREFIXES");
    expect(PROXY_SOURCE).not.toContain("getModuleKeyForPath");
  });

  it("preserva el gate de sesión (login) y el gate exclusivo de /copilot/admin para superadmin", () => {
    expect(PROXY_SOURCE).toContain("isValidCopilotSessionCookieAsync");
    expect(PROXY_SOURCE).toContain("isAdminPath");
    expect(PROXY_SOURCE).toContain("isSuperAdmin(parsed.role");
  });
});

describe("clave canónica de Banco: bank_movements en todas las superficies", () => {
  it("MODULE_KEYS incluye bank_movements y ninguna variante legacy", () => {
    expect(MODULE_KEYS).toContain(CANONICAL_BANK_KEY);
    for (const legacy of LEGACY_BANK_KEYS) {
      expect(MODULE_KEYS as readonly string[]).not.toContain(legacy);
    }
  });

  it("página de Banco usa isModuleAccessDenied('bank_movements')", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "app", "copilot", "movimientos-bancarios", "page.tsx"),
      "utf8"
    );
    expect(pageSource).toContain('isModuleAccessDenied("bank_movements")');
  });

  it("sidebar declara moduleKey: \"bank_movements\" para el ítem Banco", () => {
    const navSource = readFileSync(
      join(process.cwd(), "components", "copilot", "copilot-nav-config.tsx"),
      "utf8"
    );
    expect(navSource).toContain('moduleKey: "bank_movements"');
    for (const legacy of LEGACY_BANK_KEYS) {
      expect(navSource).not.toContain(`moduleKey: "${legacy}"`);
    }
  });

  it("mapa de módulos de API asocia /api/copilot/bank-movements y /api/copilot/bank-reconciliation a bank_movements", () => {
    const mapSource = readFileSync(join(process.cwd(), "lib", "auth", "copilot-api-module-map.ts"), "utf8");
    expect(mapSource).toContain('["/api/copilot/bank-movements", "bank_movements"]');
    expect(mapSource).toContain('["/api/copilot/bank-reconciliation", "bank_movements"]');
  });
});

describe("override de DB gana al preset del rol para bank_movements (regresión directa del bug)", () => {
  it("rol usuario con preset 'none' + override 'write' en DB → efectivo 'write'", () => {
    expect(getDefaultAccessLevel("usuario", "bank_movements")).toBe("none");

    const presets = getDefaultPermissionsForRole("usuario");
    const effective = resolveEffectivePermissions("usuario", presets, [
      { moduleKey: "bank_movements", accessLevel: "write" },
    ]);

    expect(canReadModule("usuario", effective, "bank_movements")).toBe(true);
    expect(canWriteModule("usuario", effective, "bank_movements")).toBe(true);
  });

  it("rol cobranza con preset 'none' + override 'read' en DB → lee pero no escribe", () => {
    expect(getDefaultAccessLevel("cobranza", "bank_movements")).toBe("none");

    const presets = getDefaultPermissionsForRole("cobranza");
    const effective = resolveEffectivePermissions("cobranza", presets, [
      { moduleKey: "bank_movements", accessLevel: "read" },
    ]);

    expect(canReadModule("cobranza", effective, "bank_movements")).toBe(true);
    expect(canWriteModule("cobranza", effective, "bank_movements")).toBe(false);
  });

  it("sin override, el preset 'none' del rol usuario bloquea lectura y escritura", () => {
    const presets = getDefaultPermissionsForRole("usuario");
    const effective = resolveEffectivePermissions("usuario", presets, []);
    expect(canReadModule("usuario", effective, "bank_movements")).toBe(false);
    expect(canWriteModule("usuario", effective, "bank_movements")).toBe(false);
  });

  it("write=true implica read=true (sin combinación inválida write-sin-read)", () => {
    const presets = getDefaultPermissionsForRole("usuario");
    const effective = resolveEffectivePermissions("usuario", presets, [
      { moduleKey: "bank_movements", accessLevel: "write" },
    ]);
    expect(canWriteModule("usuario", effective, "bank_movements")).toBe(true);
    expect(canReadModule("usuario", effective, "bank_movements")).toBe(true);
  });
});

describe("acciones y manual: guard client-side falla cerrado (endurecido)", () => {
  it("acciones/page.tsx trata modulePermissions ausente como 'none' (?? \"none\")", () => {
    const src = readFileSync(join(process.cwd(), "app", "copilot", "acciones", "page.tsx"), "utf8");
    expect(src).toContain('(modulePermissions["acciones"] ?? "none") === "none"');
  });

  it("manual/page.tsx trata modulePermissions ausente como 'none' (?? \"none\")", () => {
    const src = readFileSync(join(process.cwd(), "app", "copilot", "manual", "page.tsx"), "utf8");
    expect(src).toContain('(modulePermissions["manual"] ?? "none") === "none"');
  });
});
