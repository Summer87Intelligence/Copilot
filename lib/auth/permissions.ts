export const ROLE_SUPERADMIN = "superadmin";
export const ROLE_DEMO_READONLY = "demo_readonly";
export const ROLE_USUARIO = "usuario";

export function isSuperAdmin(role: string): boolean {
  return role.toLowerCase() === ROLE_SUPERADMIN;
}

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
