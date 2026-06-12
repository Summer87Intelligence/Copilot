/**
 * Presets de permisos por módulo según rol.
 * Son los permisos "por defecto" que se aplican cuando no hay fila explícita
 * en app_user_permissions.
 */

import type { ModuleKey, ModulePermission, AccessLevel } from "@/lib/auth/module-permissions";
import { MODULE_KEYS } from "@/lib/auth/module-permissions";

type RolePreset = Record<ModuleKey, AccessLevel>;

const SUPERADMIN_PRESET: RolePreset = {
  hoy: "admin",
  dashboard: "admin",
  acciones: "admin",
  clientes: "admin",
  cartera: "admin",
  tesoreria: "admin",
  finanzas: "admin",
  reportes: "admin",
  datos: "admin",
  agentes: "admin",
  manual: "admin",
  admin: "admin",
};

const USUARIO_PRESET: RolePreset = {
  hoy: "read",
  dashboard: "read",
  acciones: "read",
  clientes: "read",
  cartera: "read",
  tesoreria: "read",
  finanzas: "read",
  reportes: "read",
  datos: "read",
  agentes: "read",
  manual: "read",
  admin: "none",
};

const COBRANZA_PRESET: RolePreset = {
  hoy: "read",
  dashboard: "read",
  acciones: "write",
  clientes: "write",
  cartera: "read",
  tesoreria: "none",
  finanzas: "read",
  reportes: "read",
  datos: "read",
  agentes: "read",
  manual: "read",
  admin: "none",
};

const TESORERIA_PRESET: RolePreset = {
  hoy: "read",
  dashboard: "read",
  acciones: "read",
  clientes: "read",
  cartera: "read",
  tesoreria: "write",
  finanzas: "read",
  reportes: "read",
  datos: "read",
  agentes: "read",
  manual: "read",
  admin: "none",
};

const CONTADOR_PRESET: RolePreset = {
  hoy: "read",
  dashboard: "read",
  acciones: "read",
  clientes: "read",
  cartera: "read",
  tesoreria: "read",
  finanzas: "read",
  reportes: "read",
  datos: "read",
  agentes: "read",
  manual: "read",
  admin: "none",
};

const PRESETS: Record<string, RolePreset> = {
  superadmin: SUPERADMIN_PRESET,
  usuario: USUARIO_PRESET,
  demo_readonly: USUARIO_PRESET,
  cobranza: COBRANZA_PRESET,
  tesoreria: TESORERIA_PRESET,
  contador: CONTADOR_PRESET,
};

const FALLBACK_PRESET: RolePreset = USUARIO_PRESET;

/** Devuelve la lista de ModulePermission para el rol dado. */
export function getDefaultPermissionsForRole(role: string): ModulePermission[] {
  const preset = PRESETS[role.toLowerCase()] ?? FALLBACK_PRESET;
  return MODULE_KEYS.map((moduleKey) => ({
    moduleKey,
    accessLevel: preset[moduleKey],
  }));
}

/** Devuelve el access_level por defecto para un rol+módulo específico. */
export function getDefaultAccessLevel(role: string, moduleKey: ModuleKey): AccessLevel {
  const preset = PRESETS[role.toLowerCase()] ?? FALLBACK_PRESET;
  return preset[moduleKey] ?? "none";
}

/** Lista de roles soportados. */
export const SUPPORTED_ROLES = [
  "superadmin",
  "usuario",
  "demo_readonly",
  "cobranza",
  "tesoreria",
  "contador",
] as const;

export type SupportedRole = (typeof SUPPORTED_ROLES)[number];

export function isValidRole(v: unknown): v is SupportedRole {
  return typeof v === "string" && (SUPPORTED_ROLES as readonly string[]).includes(v);
}

/** Label visible de cada rol. */
export const ROLE_LABELS: Record<SupportedRole, string> = {
  superadmin: "Administrador general",
  usuario: "Usuario",
  demo_readonly: "Demo solo lectura",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  contador: "Contador",
};
