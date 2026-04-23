import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

export type SuperadminAuthOk = {
  ok: true;
};

export type SuperadminAuthFail = {
  ok: false;
  response: NextResponse;
};

/**
 * Sesión Copilot válida + rol `superadmin` (misma política que `/api/admin/*`).
 */
export async function requireSuperadmin(
  request: NextRequest
): Promise<SuperadminAuthOk | SuperadminAuthFail> {
  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }
  if (auth.ctx.appUser.role?.trim().toLowerCase() !== "superadmin") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false as const,
          code: "FORBIDDEN_SUPERADMIN",
          message: "Solo los superadministradores pueden acceder a la biblioteca Zeta.",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}
