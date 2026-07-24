import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireCopilotTenantContext,
  type CopilotAuthResult,
  type CopilotTenantContext,
} from "@/lib/copilot-api-auth";
import { resolveCopilotApiModuleKey } from "@/lib/auth/copilot-api-module-map";
import {
  canAdminModule,
  canReadModule,
  canWriteModule,
  getModuleAccessLevel,
  resolveEffectivePermissions,
  type AccessLevel,
  type ModuleKey,
  type ModulePermission,
} from "@/lib/auth/module-permissions";
import { getDefaultPermissionsForRole } from "@/lib/auth/role-permission-presets";
import { isReadOnlyRole } from "@/lib/auth/permissions";
import {
  bankMovementsScopeFromAccessLevel,
  canReadBankMovementsScope,
  mustForceBankInflowOnly,
} from "@/lib/auth/bank-movements-scope";
import type { AppUser } from "@/types/app-user";

export type CopilotModuleAccessOptions = {
  /** Nivel mínimo requerido. Default: read (bloquea none). */
  minAccess?: "read" | "write";
};

function moduleForbiddenResponse(moduleKey: ModuleKey, minAccess: "read" | "write") {
  return NextResponse.json(
    {
      ok: false as const,
      code: "FORBIDDEN_MODULE" as const,
      message:
        minAccess === "write"
          ? "No tenés permiso de modificación en este módulo."
          : "No tenés acceso a este módulo.",
      moduleKey,
    },
    { status: 403 }
  );
}

function anyModuleForbiddenResponse(moduleKeys: readonly ModuleKey[], minAccess: "read" | "write") {
  return NextResponse.json(
    {
      ok: false as const,
      code: "FORBIDDEN_MODULE" as const,
      message:
        minAccess === "write"
          ? "No tenés permiso de modificación en este módulo."
          : "No tenés acceso a este módulo.",
      moduleKey: moduleKeys[0] ?? null,
      moduleKeys,
    },
    { status: 403 }
  );
}

/** Carga preset + overrides DB para el usuario (fuente server-side, no cookie). */
export async function loadEffectiveModulePermissionsForAppUser(
  supabase: SupabaseClient,
  appUser: AppUser
): Promise<ModulePermission[]> {
  const role = String(appUser.role ?? "").trim();
  const workspaceId = String(appUser.company_id ?? "").trim();
  const presets = getDefaultPermissionsForRole(role);

  if (!workspaceId) {
    return resolveEffectivePermissions(role, presets, []);
  }

  const { data: overrideRows } = await supabase
    .from("app_user_permissions")
    .select("module_key, access_level")
    .eq("workspace_id", workspaceId)
    .eq("user_id", appUser.id);

  const overrides: ModulePermission[] = ((overrideRows ?? []) as Array<{
    module_key: string;
    access_level: string;
  }>)
    .filter((row) => typeof row.module_key === "string" && typeof row.access_level === "string")
    .map((row) => ({
      moduleKey: row.module_key as ModuleKey,
      accessLevel: row.access_level as AccessLevel,
    }));

  return resolveEffectivePermissions(role, presets, overrides);
}

function assertModuleAccess(
  ctx: CopilotTenantContext,
  effective: ModulePermission[],
  moduleKey: ModuleKey,
  minAccess: "read" | "write"
): NextResponse | null {
  const role = ctx.appUser.role ?? "";
  if (role.trim().toLowerCase() === "superadmin") return null;

  // FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — `bank_movements`
  // tiene un nivel intermedio `inflow_readonly` que NO alcanza el rank de
  // 'read' genérico (canReadModule) pero SÍ debe poder leer (solo ingresos,
  // enforced por el route handler). Nunca debe pasar minAccess === "write".
  if (moduleKey === "bank_movements" && minAccess === "read") {
    const level = getModuleAccessLevel(effective, moduleKey);
    const scope = bankMovementsScopeFromAccessLevel(level);
    if (!canReadBankMovementsScope(scope)) {
      return moduleForbiddenResponse(moduleKey, minAccess);
    }
    return null;
  }

  const allowed =
    minAccess === "write"
      ? canWriteModule(role, effective, moduleKey)
      : canReadModule(role, effective, moduleKey);

  if (!allowed) {
    return moduleForbiddenResponse(moduleKey, minAccess);
  }
  return null;
}

/**
 * Nivel de acceso efectivo (preset + overrides DB) para un módulo, ya
 * resuelto para el appUser de este ctx. superadmin → 'admin'. Usar en route
 * handlers de `bank_movements` para derivar el `BankMovementsScope` real
 * (p. ej. forzar `direction=inflow` para `inflow_readonly`).
 */
export async function getCopilotModuleAccessLevel(
  ctx: CopilotTenantContext,
  moduleKey: ModuleKey
): Promise<AccessLevel> {
  const role = ctx.appUser.role?.trim().toLowerCase() ?? "";
  if (role === "superadmin") return "admin";
  const effective = await loadEffectiveModulePermissionsForAppUser(ctx.supabase, ctx.appUser);
  return getModuleAccessLevel(effective, moduleKey);
}

/** true si el alcance efectivo de `bank_movements` es exactamente `inflow_readonly`. */
export async function isBankMovementsInflowReadonly(ctx: CopilotTenantContext): Promise<boolean> {
  const level = await getCopilotModuleAccessLevel(ctx, "bank_movements");
  return mustForceBankInflowOnly(bankMovementsScopeFromAccessLevel(level));
}

/**
 * RBAC para superficies de `bank_movements` que son historial/reconciliación
 * (Importaciones, y cualquier endpoint auxiliar exclusivo de esa vista) —
 * nunca la lista acotada de movimientos. `inflow_readonly` puede leer
 * movimientos (solo ingresos) vía `requireCopilotModuleAccess`, pero jamás
 * debe ver el historial de importaciones ni por UI ni invocando la API
 * directamente. Guard pensado para correr ANTES de cualquier consulta a datos.
 */
export async function requireBankMovementsFullReadAccess(
  request: NextRequest,
  body?: unknown
): Promise<CopilotAuthResult> {
  const auth = await requireCopilotModuleAccess(request, "bank_movements", body);
  if (!auth.ok) return auth;

  if (await isBankMovementsInflowReadonly(auth.ctx)) {
    return { ok: false, response: moduleForbiddenResponse("bank_movements", "read") };
  }

  return auth;
}

/**
 * Auth tenant + RBAC por módulo (preset + app_user_permissions en DB).
 * - 401/403 membresía: requireCopilotTenantContext
 * - 403 FORBIDDEN_MODULE: access_level none o por debajo de minAccess
 * - superadmin: bypass
 */
export async function requireCopilotModuleAccess(
  request: NextRequest,
  moduleKey: ModuleKey,
  body?: unknown,
  options?: CopilotModuleAccessOptions
): Promise<CopilotAuthResult> {
  const minAccess = options?.minAccess ?? "read";
  const auth = await requireCopilotTenantContext(request, body);
  if (!auth.ok) return auth;

  const role = auth.ctx.appUser.role?.trim().toLowerCase() ?? "";
  if (role === "superadmin") {
    return auth;
  }

  const effective = await loadEffectiveModulePermissionsForAppUser(
    auth.ctx.supabase,
    auth.ctx.appUser
  );
  const denied = assertModuleAccess(auth.ctx, effective, moduleKey, minAccess);
  if (denied) {
    return { ok: false, response: denied };
  }

  return auth;
}

/**
 * Auth tenant + RBAC para endpoints de lectura compartidos por varias superficies.
 * Ej.: `/api/copilot/portfolio` alimenta Clientes, Cobranza, Reportes y Cartera.
 * El contrato es "si puede leer al menos un módulo consumidor, puede leer el
 * dataset del workspace que ese módulo necesita"; nunca habilita escritura.
 */
export async function requireCopilotModuleAccessAny(
  request: NextRequest,
  moduleKeys: readonly ModuleKey[],
  body?: unknown,
  options?: CopilotModuleAccessOptions
): Promise<CopilotAuthResult> {
  const minAccess = options?.minAccess ?? "read";
  const auth = await requireCopilotTenantContext(request, body);
  if (!auth.ok) return auth;

  const role = auth.ctx.appUser.role?.trim().toLowerCase() ?? "";
  if (role === "superadmin") {
    return auth;
  }

  const effective = await loadEffectiveModulePermissionsForAppUser(
    auth.ctx.supabase,
    auth.ctx.appUser
  );
  const allowed = moduleKeys.some((moduleKey) =>
    minAccess === "write"
      ? canWriteModule(role, effective, moduleKey)
      : canReadModule(role, effective, moduleKey)
  );

  if (!allowed) {
    return { ok: false, response: anyModuleForbiddenResponse(moduleKeys, minAccess) };
  }

  return auth;
}

/**
 * RBAC write canónico (DB-aware):
 * 1) permiso efectivo del módulo ≥ write (preset + overrides);
 * 2) bloqueo global solo para `demo_readonly` (`isReadOnlyRole`).
 *
 * Un rol base (p. ej. `usuario`) con override write en el módulo DEBE poder
 * mutar. Nunca devolver READ_ONLY_USER solo por el nombre del rol cuando el
 * permiso efectivo es write.
 */
export async function requireCopilotModuleWriteAccess(
  request: NextRequest,
  moduleKey: ModuleKey,
  body?: unknown
): Promise<CopilotAuthResult> {
  const auth = await requireCopilotModuleAccess(request, moduleKey, body, {
    minAccess: "write",
  });
  if (!auth.ok) return auth;

  if (isReadOnlyRole(auth.ctx.appUser.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "READ_ONLY_USER",
          message: "Este usuario es solo lectura. Solo un superadmin puede modificar datos.",
        },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * RBAC admin: exige access_level 'admin' en el módulo (superadmin bypass).
 * Usar para gestión de catálogo/clasificaciones/aliases de Ventas.
 */
export async function requireCopilotModuleAdminAccess(
  request: NextRequest,
  moduleKey: ModuleKey,
  body?: unknown
): Promise<CopilotAuthResult> {
  const auth = await requireCopilotTenantContext(request, body);
  if (!auth.ok) return auth;

  const role = auth.ctx.appUser.role?.trim().toLowerCase() ?? "";
  if (role === "superadmin") return auth;

  const effective = await loadEffectiveModulePermissionsForAppUser(
    auth.ctx.supabase,
    auth.ctx.appUser
  );
  if (!canAdminModule(auth.ctx.appUser.role ?? "", effective, moduleKey)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false as const,
          code: "FORBIDDEN_MODULE" as const,
          message: "Necesitás permiso de administración en este módulo.",
          moduleKey,
        },
        { status: 403 }
      ),
    };
  }
  return auth;
}

/** Resuelve module_key desde pathname y aplica RBAC (null → solo tenant auth). */
export async function requireCopilotApiModuleAccess(
  request: NextRequest,
  body?: unknown,
  options?: CopilotModuleAccessOptions
): Promise<CopilotAuthResult> {
  const moduleKey = resolveCopilotApiModuleKey(request.nextUrl.pathname);
  if (!moduleKey) {
    return requireCopilotTenantContext(request, body);
  }
  return requireCopilotModuleAccess(request, moduleKey, body, options);
}
