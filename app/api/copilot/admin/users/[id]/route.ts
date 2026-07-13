import { NextRequest, NextResponse } from "next/server";

import { requireAdminContext } from "@/lib/auth/admin-api-auth";
import {
  buildDeletedEmailPlaceholder,
  buildDeletedUsernamePlaceholder,
  countActiveSuperadmins,
  invalidateUserSessions,
  isLastActiveSuperadminGuard,
} from "@/lib/auth/app-user-lifecycle";
import { isValidRole } from "@/lib/auth/role-permission-presets";

export const dynamic = "force-dynamic";

type TargetUserRow = {
  id: string;
  role: string;
  is_active: boolean | null;
  deleted_at: string | null;
};

/**
 * PATCH /api/copilot/admin/users/:id
 * Cambia rol o estado (is_active) de un usuario del workspace.
 * Desactivar: is_active=false + invalida sesiones. No borra permisos ni historial.
 * Reactivar: is_active=true (solo si deleted_at IS NULL).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) return auth.response;
  const { admin, tenantCompanyId } = auth.ctx;

  const params = await context.params;
  const targetId = params.id?.trim();
  if (!targetId) {
    return NextResponse.json({ ok: false, message: "ID inválido." }, { status: 400 });
  }

  const { data: targetUser, error: fetchErr } = await admin
    .from("app_users")
    .select("id, role, is_active, deleted_at")
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId)
    .maybeSingle();

  if (fetchErr || !targetUser) {
    return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
  }

  const user = targetUser as TargetUserRow;

  if (user.deleted_at) {
    return NextResponse.json(
      { ok: false, message: "Esta cuenta fue eliminada y no se puede modificar." },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body inválido." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  let shouldInvalidateSessions = false;

  if (typeof b.role === "string") {
    const newRole = b.role.trim().toLowerCase();
    if (!isValidRole(newRole)) {
      return NextResponse.json({ ok: false, message: `Rol inválido: ${newRole}` }, { status: 400 });
    }

    const currentRole = user.role?.toLowerCase();
    if (currentRole === "superadmin" && newRole !== "superadmin") {
      const superadminCount = await countActiveSuperadmins(admin, tenantCompanyId);
      if (isLastActiveSuperadminGuard(currentRole, superadminCount)) {
        return NextResponse.json(
          { ok: false, message: "No podés eliminar el último administrador activo." },
          { status: 409 }
        );
      }
    }

    updates.role = newRole;
  }

  if (typeof b.is_active === "boolean") {
    const newActive = b.is_active;
    const wasActive = user.is_active !== false;

    if (!newActive && wasActive) {
      const currentRole = user.role?.toLowerCase();
      if (currentRole === "superadmin") {
        const superadminCount = await countActiveSuperadmins(admin, tenantCompanyId);
        if (isLastActiveSuperadminGuard(currentRole, superadminCount)) {
          return NextResponse.json(
            { ok: false, message: "No podés desactivar el último administrador activo." },
            { status: 409 }
          );
        }
      }
      shouldInvalidateSessions = true;
    }

    updates.is_active = newActive;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, message: "No hay campos para actualizar." }, { status: 400 });
  }

  const { error: updateErr } = await admin
    .from("app_users")
    .update(updates)
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId);

  if (updateErr) {
    return NextResponse.json({ ok: false, message: updateErr.message }, { status: 500 });
  }

  if (shouldInvalidateSessions) {
    const bump = await invalidateUserSessions(admin, targetId);
    if (!bump.ok) {
      return NextResponse.json(
        { ok: false, message: "Usuario desactivado pero no se pudo cerrar la sesión activa." },
        { status: 500 }
      );
    }
  }

  const message =
    typeof b.is_active === "boolean"
      ? b.is_active
        ? "Cuenta reactivada. La persona ya puede iniciar sesión."
        : "Cuenta desactivada. La persona no podrá iniciar sesión, pero su información e historial se conservan."
      : "Usuario actualizado.";

  return NextResponse.json({ ok: true, message });
}

/**
 * DELETE /api/copilot/admin/users/:id
 * Soft-delete: marca deleted_at, anonimiza credenciales, invalida sesiones.
 * No borra filas ni permisos (FKs e historial intactos).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminContext(request);
  if (!auth.ok) return auth.response;
  const { admin, tenantCompanyId, actorId } = auth.ctx;

  const params = await context.params;
  const targetId = params.id?.trim();
  if (!targetId) {
    return NextResponse.json({ ok: false, message: "ID inválido." }, { status: 400 });
  }

  if (targetId === actorId) {
    return NextResponse.json(
      { ok: false, message: "No podés eliminar tu propia cuenta." },
      { status: 409 }
    );
  }

  const { data: targetUser, error: fetchErr } = await admin
    .from("app_users")
    .select("id, role, is_active, deleted_at, email")
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId)
    .maybeSingle();

  if (fetchErr || !targetUser) {
    return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
  }

  const user = targetUser as TargetUserRow & { email: string };

  if (user.deleted_at) {
    return NextResponse.json(
      { ok: false, message: "Esta cuenta ya fue eliminada." },
      { status: 409 }
    );
  }

  const currentRole = user.role?.toLowerCase();
  if (currentRole === "superadmin") {
    const superadminCount = await countActiveSuperadmins(admin, tenantCompanyId);
    if (isLastActiveSuperadminGuard(currentRole, superadminCount)) {
      return NextResponse.json(
        { ok: false, message: "No podés eliminar el último administrador activo." },
        { status: 409 }
      );
    }
  }

  const now = new Date().toISOString();

  const { error: deleteErr } = await admin
    .from("app_users")
    .update({
      is_active: false,
      deleted_at: now,
      email: buildDeletedEmailPlaceholder(targetId),
      username: buildDeletedUsernamePlaceholder(targetId),
      pin: null,
      pin_hash: null,
    })
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId);

  if (deleteErr) {
    return NextResponse.json({ ok: false, message: deleteErr.message }, { status: 500 });
  }

  const bump = await invalidateUserSessions(admin, targetId);
  if (!bump.ok) {
    return NextResponse.json(
      { ok: false, message: "Cuenta eliminada pero no se pudo cerrar la sesión activa." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Cuenta eliminada. El acceso fue revocado y no se puede deshacer.",
  });
}
