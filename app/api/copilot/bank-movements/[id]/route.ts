import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  getCopilotModuleAccessLevel,
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { bankMovementsScopeFromAccessLevel, mustForceBankInflowOnly } from "@/lib/auth/bank-movements-scope";
import { stripBankMovementBalanceMetadata } from "@/lib/bank-movements/bank-movement-balance-privacy";
import {
  bankMovementUpdateBodySchema,
  buildBankMovementPatch,
} from "@/lib/bank-movements/bank-movements-api";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

function invalidId() {
  return NextResponse.json(
    { ok: false as const, error: "Identificador de movimiento inválido." },
    { status: 400 }
  );
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const { data, error } = await supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo cargar el movimiento." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false as const, error: "Movimiento no encontrado." },
      { status: 404 }
    );
  }

  const movement = data as BankMovement;

  // FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — `inflow_readonly`
  // no debe poder confirmar la existencia de egresos ni ver su detalle:
  // tratamos un egreso fuera de su alcance como si no existiera (404), igual
  // que el listado ya lo excluye del alcance de este lector.
  const accessLevel = await getCopilotModuleAccessLevel(auth.ctx, "bank_movements");
  const scope = bankMovementsScopeFromAccessLevel(accessLevel);
  const forceInflowOnly = mustForceBankInflowOnly(scope);
  if (forceInflowOnly && movement.direction !== "inflow") {
    return NextResponse.json(
      { ok: false as const, error: "Movimiento no encontrado." },
      { status: 404 }
    );
  }

  // inflow_readonly ve el movimiento individual, nunca un saldo de cuenta.
  const responseMovement = forceInflowOnly ? stripBankMovementBalanceMetadata(movement) : movement;

  return NextResponse.json({ ok: true as const, data: responseMovement });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const parsed = await parseAndValidateJsonBody(request, bankMovementUpdateBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "bank_movements",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const patch = buildBankMovementPatch(parsed.data, { userId: appUser.id });

  const { data, error } = await supabase
    .from("bank_movements")
    .update(patch)
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo actualizar el movimiento." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false as const, error: "Movimiento no encontrado." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true as const, data: data as BankMovement });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const { data, error } = await supabase
    .from("bank_movements")
    .delete()
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo eliminar el movimiento." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false as const, error: "Movimiento no encontrado." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true as const, data: { id } });
}
