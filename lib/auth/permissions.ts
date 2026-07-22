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
 * Solo `demo_readonly`: cuenta de demostración sin escritura real.
 *
 * El rol base `usuario` NO es read-only global: sus mutaciones se
 * autorizan por permiso efectivo de módulo (preset + `app_user_permissions`).
 * Los roles operativos (cobranza, tesoreria, contador) tampoco están aquí.
 */
export function isReadOnlyRole(role: string): boolean {
  return role.toLowerCase() === ROLE_DEMO_READONLY;
}

export function canWrite(role: string): boolean {
  return isSuperAdmin(role);
}

export function canRead(_role: string): boolean {
  return true;
}
