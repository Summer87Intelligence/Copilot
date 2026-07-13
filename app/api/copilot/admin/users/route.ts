import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { requireAdminContext } from "@/lib/auth/admin-api-auth";
import { hashPin } from "@/lib/security/pin-hash";
import { getDefaultPermissionsForRole, isValidRole } from "@/lib/auth/role-permission-presets";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

type AppUserRow = {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  role: string;
  is_active: boolean | null;
  deleted_at: string | null;
  created_at: string;
  last_login_at: string | null;
};

type PermissionRow = {
  user_id: string;
  module_key: string;
  access_level: string;
};

function generateTemporaryPin(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pin = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    pin += chars[bytes[i] % chars.length];
  }
  return pin;
}

/**
 * GET /api/copilot/admin/users
 * Lista todos los usuarios del workspace con sus permisos efectivos.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) return auth.response;
  const { admin, tenantCompanyId } = auth.ctx;

  const { data: users, error: usersErr } = await admin
    .from("app_users")
    .select("id, full_name, email, username, role, is_active, deleted_at, created_at, last_login_at")
    .eq("company_id", tenantCompanyId)
    .order("created_at", { ascending: false });

  if (usersErr) {
    return copilotInternalErrorResponse();
  }

  const rows = (users ?? []) as AppUserRow[];
  const userIds = rows.map((r) => r.id);

  let permissionRows: PermissionRow[] = [];
  if (userIds.length > 0) {
    const { data: perms } = await admin
      .from("app_user_permissions")
      .select("user_id, module_key, access_level")
      .eq("workspace_id", tenantCompanyId)
      .in("user_id", userIds);
    permissionRows = (perms ?? []) as PermissionRow[];
  }

  const result = rows.map((user) => {
    const explicitPerms = permissionRows
      .filter((p) => p.user_id === user.id)
      .map((p) => ({ moduleKey: p.module_key, accessLevel: p.access_level }));

    const preset = getDefaultPermissionsForRole(user.role);
    const effectivePermissions = preset.map((p) => {
      const override = explicitPerms.find((e) => e.moduleKey === p.moduleKey);
      return override ?? p;
    });

    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      username: user.username,
      role: user.role,
      is_active: user.is_active !== false && !user.deleted_at,
      deleted_at: user.deleted_at,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
      permissions: effectivePermissions,
    };
  });

  return NextResponse.json({ ok: true, users: result });
}

/**
 * POST /api/copilot/admin/users
 * Crea un nuevo usuario en el workspace.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) return auth.response;
  const { admin, tenantCompanyId } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body inválido." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, message: "Body inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const full_name = typeof b.full_name === "string" ? b.full_name.trim() : "";
  const role = typeof b.role === "string" ? b.role.trim().toLowerCase() : "";
  const pinInput = typeof b.pin === "string" ? b.pin.trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: "Email inválido." }, { status: 400 });
  }
  if (!full_name) {
    return NextResponse.json({ ok: false, message: "El nombre es requerido." }, { status: 400 });
  }
  if (!isValidRole(role)) {
    return NextResponse.json({ ok: false, message: `Rol inválido: ${role}` }, { status: 400 });
  }
  if (role === "superadmin") {
    // Crear superadmins solo si no hay riesgo — permitido, el caller ya es superadmin
  }

  // Generar o usar PIN provisto
  const plainPin = pinInput && pinInput.length >= 4 ? pinInput : generateTemporaryPin();
  const pinHash = await hashPin(plainPin);

  // Chequear email no duplicado en el workspace
  const { data: existing } = await admin
    .from("app_users")
    .select("id, deleted_at")
    .eq("company_id", tenantCompanyId)
    .eq("email", email)
    .maybeSingle();

  if (existing && !(existing as { deleted_at?: string | null }).deleted_at) {
    return NextResponse.json(
      { ok: false, message: "Ya existe un usuario con ese email en el workspace." },
      { status: 409 }
    );
  }

  // Insertar usuario
  const { data: newUser, error: insertErr } = await admin
    .from("app_users")
    .insert({
      company_id: tenantCompanyId,
      full_name,
      email,
      username: email,
      role,
      pin_hash: pinHash,
      is_active: true,
      credential_version: 1,
    })
    .select("id, full_name, email, role, created_at")
    .single();

  if (insertErr || !newUser) {
    return NextResponse.json(
      { ok: false, message: insertErr?.message ?? "Error al crear el usuario." },
      { status: 500 }
    );
  }

  const userId = (newUser as { id: string }).id;

  // Insertar permisos por defecto del rol (sin módulo admin para no-superadmin)
  const defaultPerms = getDefaultPermissionsForRole(role);
  const permRows = defaultPerms.map((p) => ({
    workspace_id: tenantCompanyId,
    user_id: userId,
    module_key: p.moduleKey,
    access_level: p.accessLevel,
  }));

  await admin.from("app_user_permissions").insert(permRows);

  return NextResponse.json(
    {
      ok: true,
      user: newUser,
      temporary_pin: plainPin,
      message: "Usuario creado. Mostrá el PIN solo una vez.",
    },
    { status: 201 }
  );
}
