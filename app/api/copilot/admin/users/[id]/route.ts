import { NextRequest, NextResponse } from "next/server";

import { requireAdminContext } from "@/lib/auth/admin-api-auth";
import { isValidRole } from "@/lib/auth/role-permission-presets";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/copilot/admin/users/:id
 * Cambia rol o estado (is_active) de un usuario del workspace.
 * Protección: no se puede quitar superadmin al último superadmin.
 */
export async function PATCH(
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

  // Verificar que el usuario pertenece al workspace
  const { data: targetUser, error: fetchErr } = await admin
    .from("app_users")
    .select("id, role, is_active")
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId)
    .maybeSingle();

  if (fetchErr || !targetUser) {
    return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body inválido." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  // Cambio de rol
  if (typeof b.role === "string") {
    const newRole = b.role.trim().toLowerCase();
    if (!isValidRole(newRole)) {
      return NextResponse.json({ ok: false, message: `Rol inválido: ${newRole}` }, { status: 400 });
    }

    const currentRole = (targetUser as { role: string }).role?.toLowerCase();

    // No degradar el último superadmin activo del workspace.
    // Como `requireAdminContext` garantiza que el actor ya es superadmin, si
    // sólo queda 1 superadmin activo y se está intentando bajar a alguien
    // del rol superadmin, ese alguien es necesariamente el propio actor.
    if (currentRole === "superadmin" && newRole !== "superadmin") {
      const safetyCheck = await admin
        .from("app_users")
        .select("id", { count: "exact" })
        .eq("company_id", tenantCompanyId)
        .eq("role", "superadmin")
        .eq("is_active", true);

      const superadminCount = safetyCheck.count ?? 0;
      if (superadminCount <= 1) {
        return NextResponse.json(
          { ok: false, message: "No podés eliminar el último administrador activo." },
          { status: 409 }
        );
      }
    }
    // Silenciar warning de unused: actorId queda disponible para futuras safeguards.
    void actorId;

    updates.role = newRole;
  }

  // Cambio de estado
  if (typeof b.is_active === "boolean") {
    const newActive = b.is_active;

    // No desactivar el último superadmin
    if (!newActive) {
      const currentRole = (targetUser as { role: string }).role?.toLowerCase();
      if (currentRole === "superadmin") {
        const safetyCheck = await admin
          .from("app_users")
          .select("id", { count: "exact" })
          .eq("company_id", tenantCompanyId)
          .eq("role", "superadmin")
          .eq("is_active", true);

        const superadminCount = safetyCheck.count ?? 0;
        if (superadminCount <= 1) {
          return NextResponse.json(
            { ok: false, message: "No podés desactivar el último administrador activo." },
            { status: 409 }
          );
        }
      }
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

  return NextResponse.json({ ok: true, message: "Usuario actualizado." });
}

/**
 * DELETE /api/copilot/admin/users/:id
 * Soft-deletes a user (is_active=false, deleted_at=now()).
 * Last superadmin cannot be deleted.
 */
export async function DELETE(
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
    .select("id, role, is_active")
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId)
    .maybeSingle();

  if (fetchErr || !targetUser) {
    return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
  }

  const currentRole = (targetUser as { role: string }).role?.toLowerCase();
  if (currentRole === "superadmin") {
    const safetyCheck = await admin
      .from("app_users")
      .select("id", { count: "exact" })
      .eq("company_id", tenantCompanyId)
      .eq("role", "superadmin")
      .eq("is_active", true);
    if ((safetyCheck.count ?? 0) <= 1) {
      return NextResponse.json(
        { ok: false, message: "No podés eliminar el último administrador activo." },
        { status: 409 }
      );
    }
  }

  const { error: deleteErr } = await admin
    .from("app_users")
    .update({ is_active: false })
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId);

  if (deleteErr) {
    return NextResponse.json({ ok: false, message: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Usuario desactivado. Ya no tiene acceso." });
}
