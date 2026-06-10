/**
 * Sistema de permisos por módulo.
 * Cada usuario tiene un nivel de acceso ('none'|'read'|'write'|'admin') por módulo.
 * Flujo de resolución: superadmin bypass → fila explícita DB → preset del rol.
 *
 * Los presets están en role-permission-presets.ts (sin dependencia circular).
 * Los callers deben resolver permisos efectivos con resolveEffectivePermissions()
 * antes de llamar a los helpers can*.
 */

export const MODULE_KEYS = [
  "hoy",
  "dashboard",
  "acciones",
  "clientes",
  "cartera",
  "tesoreria",
  "finanzas",
  "reportes",
  "datos",
  "agentes",
  "manual",
  "admin",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const ACCESS_LEVELS = ["none", "read", "write", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

export type ModulePermission = {
  moduleKey: ModuleKey;
  accessLevel: AccessLevel;
};

/**
 * Combina el preset del rol con las overrides explícitas del DB.
 * Las filas explícitas del DB tienen prioridad sobre el preset.
 * Para superadmin devuelve admin en todos los módulos.
 */
export function resolveEffectivePermissions(
  role: string,
  presetPermissions: ModulePermission[],
  explicitOverrides: ModulePermission[]
): ModulePermission[] {
  if (role.toLowerCase() === "superadmin") {
    return MODULE_KEYS.map((k) => ({ moduleKey: k, accessLevel: "admin" as AccessLevel }));
  }
  return presetPermissions.map((preset) => {
    const override = explicitOverrides.find((o) => o.moduleKey === preset.moduleKey);
    return override ?? preset;
  });
}

/** Encuentra el access_level efectivo para un módulo dado. */
export function getModuleAccessLevel(
  effectivePermissions: ModulePermission[],
  moduleKey: ModuleKey
): AccessLevel {
  return effectivePermissions.find((p) => p.moduleKey === moduleKey)?.accessLevel ?? "none";
}

function atLeast(level: AccessLevel, required: AccessLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

/** true si el usuario puede ver el módulo (access_level != 'none'). */
export function canAccessModule(
  role: string,
  effectivePermissions: ModulePermission[],
  moduleKey: ModuleKey
): boolean {
  if (role.toLowerCase() === "superadmin") return true;
  return getModuleAccessLevel(effectivePermissions, moduleKey) !== "none";
}

/** true si el usuario puede leer el módulo (access_level >= 'read'). */
export function canReadModule(
  role: string,
  effectivePermissions: ModulePermission[],
  moduleKey: ModuleKey
): boolean {
  if (role.toLowerCase() === "superadmin") return true;
  return atLeast(getModuleAccessLevel(effectivePermissions, moduleKey), "read");
}

/** true si el usuario puede escribir en el módulo (access_level >= 'write'). */
export function canWriteModule(
  role: string,
  effectivePermissions: ModulePermission[],
  moduleKey: ModuleKey
): boolean {
  if (role.toLowerCase() === "superadmin") return true;
  return atLeast(getModuleAccessLevel(effectivePermissions, moduleKey), "write");
}

/** true si el usuario puede administrar el módulo (access_level == 'admin'). */
export function canAdminModule(
  role: string,
  effectivePermissions: ModulePermission[],
  moduleKey: ModuleKey
): boolean {
  if (role.toLowerCase() === "superadmin") return true;
  return getModuleAccessLevel(effectivePermissions, moduleKey) === "admin";
}

/** Label legible de un nivel de acceso. */
export function accessLevelLabel(level: AccessLevel): string {
  const labels: Record<AccessLevel, string> = {
    none: "No ver",
    read: "Ver",
    write: "Modificar",
    admin: "Admin",
  };
  return labels[level];
}

/** Valida que un string sea un AccessLevel válido. */
export function isValidAccessLevel(v: unknown): v is AccessLevel {
  return typeof v === "string" && (ACCESS_LEVELS as readonly string[]).includes(v);
}

/** Valida que un string sea un ModuleKey válido. */
export function isValidModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (MODULE_KEYS as readonly string[]).includes(v as ModuleKey);
}
