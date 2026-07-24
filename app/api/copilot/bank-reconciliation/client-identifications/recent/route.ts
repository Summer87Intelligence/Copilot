import { NextRequest, NextResponse } from "next/server";

import {
  isBankMovementsInflowReadonly,
  requireCopilotModuleAccessAny,
} from "@/lib/auth/copilot-module-api-auth";
import { listRecentIdentificationEvents } from "@/lib/bank/canonical/client-identification-repository.server";
import { maskAccountOrReference } from "@/lib/bank/canonical/payer-identity";
import { resolveAppUsersById } from "@/lib/bank/canonical/resolve-app-users.server";

export const dynamic = "force-dynamic";

const STATUS_EVENT_LABEL: Record<string, string> = {
  identified: "Cliente identificado",
  shared_account: "Cuenta compartida",
  third_party: "Pago de tercero",
  revoked: "Revocado",
  excluded: "Excluido",
};

/**
 * GET /api/copilot/bank-reconciliation/client-identifications/recent?limit=20
 *
 * Eventos de identificación terminados más recientes (identificado,
 * reasignado, revocado, tercero, cuenta compartida) — para Historial,
 * separados visualmente de las conciliaciones financieras. Solo lectura.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccessAny(request, ["bank_movements", "clientes", "cobranza"]);
  if (!auth.ok) return auth.response;

  // Endpoint exclusivo de Historial (ver doc arriba): inflow_readonly nunca
  // debe verlo, aunque califique por otro módulo (p. ej. clientes:read de su
  // rol base) — esa lectura es para Clientes, no un atajo hacia Historial.
  if (await isBankMovementsInflowReadonly(auth.ctx)) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "FORBIDDEN_MODULE" as const,
        message: "No tenés acceso a este módulo.",
        moduleKey: "bank_movements" as const,
      },
      { status: 403 }
    );
  }

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

  try {
    const rows = await listRecentIdentificationEvents(auth.ctx.supabase, auth.ctx.tenantCompanyId, limit);
    const movementIds = Array.from(new Set(rows.map((r) => r.movementId)));
    const clientIds = Array.from(new Set(rows.map((r) => r.clientCompanyId)));

    const [{ data: movRows }, { data: clientRows }] = await Promise.all([
      movementIds.length > 0
        ? auth.ctx.supabase
            .from("bank_movements")
            .select("id, movement_date, amount, currency, bank_reference")
            .in("id", movementIds)
        : Promise.resolve({ data: [] as unknown[] }),
      clientIds.length > 0
        ? auth.ctx.supabase.from("proto_companies").select("id, name").in("id", clientIds)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const movementsById = new Map(
      (movRows ?? []).map((m) => [
        (m as { id: string }).id,
        m as { movement_date: string; amount: string | number; currency: string; bank_reference: string | null },
      ])
    );
    const clientsById = new Map((clientRows ?? []).map((c) => [(c as { id: string }).id, (c as { name: string }).name]));

    const actorIds = Array.from(
      new Set(
        rows
          .map((r) => (r.status === "revoked" ? r.revokedBy : r.confirmedBy))
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );
    const actorsById = await resolveAppUsersById(auth.ctx.supabase, actorIds);

    const events = rows.map((r) => {
      const mv = movementsById.get(r.movementId);
      const actorId = r.status === "revoked" ? r.revokedBy : r.confirmedBy;
      const actor = actorId ? actorsById.get(actorId) : null;
      return {
        id: r.id,
        eventLabel: STATUS_EVENT_LABEL[r.status] ?? r.status,
        status: r.status,
        clientName: clientsById.get(r.clientCompanyId) ?? "Cliente",
        date: mv?.movement_date ?? null,
        amountLabel: mv ? `${mv.currency} ${Number(mv.amount).toLocaleString("es-UY")}` : null,
        referenceMasked: mv ? maskAccountOrReference(mv.bank_reference) : null,
        actor: actor?.label ?? null,
        actorId: actorId ?? null,
        reason: r.reason,
        eventAt: r.status === "revoked" ? r.revokedAt : r.confirmedAt,
      };
    });

    return NextResponse.json({ ok: true as const, data: events });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: err instanceof Error ? err.message : "RECENT_IDENTIFICATIONS_FAILED" },
      { status: 500 }
    );
  }
}
