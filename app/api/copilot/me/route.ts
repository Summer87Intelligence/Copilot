import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

/**
 * GET /api/copilot/me
 * Usuario de negocio autenticado (sesión + app_users) sin datos extra.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      return auth.response;
    }

    const u = auth.ctx.appUser;
    return NextResponse.json({
      appUser: {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        company_id: u.company_id,
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Ocurrió un error inesperado." },
      { status: 500 }
    );
  }
}
