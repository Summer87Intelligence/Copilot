import { NextRequest, NextResponse } from "next/server";

import { requireAdminContext } from "@/lib/auth/admin-api-auth";
import {
  isValidModuleKey,
  isValidAccessLevel,
  type ModulePermission,
} from "@/lib/auth/module-permissions";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/copilot/admin/users/:id/permissions
 * Actualiza los permisos por módulo de un usuario.
 * Body: { permissions: Array<{ moduleKey: string; accessLevel: string }> }
 *
 * Restricción: no se puede asignar 'admin' a módulos de roles no-superadmin.
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

  // Verificar que el usuario pertenece al workspace
  const { data: targetUser, error: fetchErr } = await admin
    .from("app_users")
    .select("id, role")
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId)
    .maybeSingle();

  if (fetchErr || !targetUser) {
    return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
  }

  const userRole = (targetUser as { role: string }).role?.toLowerCase() ?? "";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body inválido." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const rawPerms = b.permissions;

  if (!Array.isArray(rawPerms) || rawPerms.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Se requiere permissions (array)." },
      { status: 400 }
    );
  }

  const validated: ModulePermission[] = [];
  for (const item of rawPerms) {
    if (!item || typeof item !== "object") {
      return NextResponse.json({ ok: false, message: "Permiso inválido." }, { status: 400 });
    }
    const { moduleKey, accessLevel } = item as Record<string, unknown>;
    if (!isValidModuleKey(moduleKey)) {
      return NextResponse.json(
        { ok: false, message: `moduleKey inválido: ${String(moduleKey)}` },
        { status: 400 }
      );
    }
    if (!isValidAccessLevel(accessLevel)) {
      return NextResponse.json(
        { ok: false, message: `accessLevel inválido: ${String(accessLevel)}` },
        { status: 400 }
      );
    }
    // No permitir 'admin' a no-superadmin (excepto para el módulo admin que solo superadmin puede tener)
    if (accessLevel === "admin" && userRole !== "superadmin") {
      return NextResponse.json(
        { ok: false, message: `No se puede asignar nivel 'admin' a rol ${userRole}.` },
        { status: 403 }
      );
    }
    // Módulo admin: solo superadmin puede tenerlo
    if (moduleKey === "admin" && accessLevel !== "none" && userRole !== "superadmin") {
      return NextResponse.json(
        { ok: false, message: "El módulo admin solo puede tener acceso en rol superadmin." },
        { status: 403 }
      );
    }
    validated.push({ moduleKey, accessLevel });
  }

  // Upsert usando onConflict
  const upsertRows = validated.map((p) => ({
    workspace_id: tenantCompanyId,
    user_id: targetId,
    module_key: p.moduleKey,
    access_level: p.accessLevel,
  }));

  const { error: upsertErr } = await admin
    .from("app_user_permissions")
    .upsert(upsertRows, {
      onConflict: "workspace_id,user_id,module_key",
    });

  if (upsertErr) {
    return NextResponse.json({ ok: false, message: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Permisos actualizados.", updated: validated.length });
}
