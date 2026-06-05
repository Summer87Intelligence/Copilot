import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { requireAdminContext } from "@/lib/auth/admin-api-auth";
import { hashPin } from "@/lib/security/pin-hash";
import { bumpUserCredentialVersion } from "@/lib/security/credential-version";

export const dynamic = "force-dynamic";

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
 * POST /api/copilot/admin/users/:id/reset-pin
 * Resetea el PIN de un usuario y bumps credential_version (invalida sesiones activas).
 * Devuelve el PIN temporal en texto plano una sola vez.
 */
export async function POST(
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
    .select("id")
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId)
    .maybeSingle();

  if (fetchErr || !targetUser) {
    return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
  }

  const newPin = generateTemporaryPin();
  const newHash = await hashPin(newPin);

  const { error: updateErr } = await admin
    .from("app_users")
    .update({
      pin_hash: newPin ? newHash : undefined,
      credentials_updated_at: new Date().toISOString(),
    })
    .eq("id", targetId)
    .eq("company_id", tenantCompanyId);

  if (updateErr) {
    return NextResponse.json({ ok: false, message: updateErr.message }, { status: 500 });
  }

  // Bump credential_version para invalidar sesiones activas
  const bump = await bumpUserCredentialVersion(admin, targetId);
  if (!bump.ok) {
    return NextResponse.json({ ok: false, message: bump.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    temporary_pin: newPin,
    message: "PIN reseteado. Mostrá el PIN solo una vez.",
  });
}
