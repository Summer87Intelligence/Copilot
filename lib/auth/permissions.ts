export const ROLE_SUPERADMIN = "superadmin";
export const ROLE_DEMO_READONLY = "demo_readonly";

export function isSuperAdmin(role: string): boolean {
  return role.toLowerCase() === ROLE_SUPERADMIN;
}

export function isReadOnlyRole(role: string): boolean {
  return role.toLowerCase() === ROLE_DEMO_READONLY;
}

export function canWrite(role: string): boolean {
  return isSuperAdmin(role);
}

export function canRead(_role: string): boolean {
  return true;
}
