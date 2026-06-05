export const ROLE_SUPERADMIN = "superadmin";
export const ROLE_DEMO_READONLY = "demo_readonly";
export const ROLE_USUARIO = "usuario";
export const ROLE_COBRANZA = "cobranza";
export const ROLE_TESORERIA = "tesoreria";
export const ROLE_CONTADOR = "contador";

export function isSuperAdmin(role: string): boolean {
  return role.toLowerCase() === ROLE_SUPERADMIN;
}

/**
 * Roles que bloquean TODAS las mutaciones a nivel de middleware.
 * Los roles operativos (cobranza, tesoreria, contador) no están aquí:
 * sus restricciones se aplican por módulo a nivel de route handler.
 */
export function isReadOnlyRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === ROLE_DEMO_READONLY || r === ROLE_USUARIO;
}

export function canWrite(role: string): boolean {
  return isSuperAdmin(role);
}

export function canRead(_role: string): boolean {
  return true;
}
