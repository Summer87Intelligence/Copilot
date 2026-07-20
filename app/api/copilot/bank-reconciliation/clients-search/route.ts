import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { searchShadowClients } from "@/lib/bank/intelligence/server/repositories";

export const dynamic = "force-dynamic";

/**
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — búsqueda server-side de
 * clientes para la selección manual de "otra coincidencia" en el drawer de
 * Ingresos. Nunca devuelve el portfolio completo: paginada (máx 50 por
 * página) y filtrada por texto. Solo lectura.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() || undefined;
  const limitRaw = Number(params.get("limit") ?? "20");
  const offsetRaw = Number(params.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  try {
    const clients = await searchShadowClients(auth.ctx.supabase, auth.ctx.tenantCompanyId, { query, limit, offset });
    return NextResponse.json({
      ok: true as const,
      data: clients.map((c) => ({ id: c.id, name: c.name ?? "Cliente" })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo buscar clientes.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
