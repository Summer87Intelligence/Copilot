import { type NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseJsonBody } from "@/lib/api/parse-json-body";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";
import {
  assignOperationalOwner,
  unassignOperationalOwner,
} from "@/lib/data/decision-operational-state-repository";

type AssignableUserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean | null;
};

export async function PATCH(req: NextRequest) {
  const auth = await requireCopilotModuleWriteAccess(req, "acciones");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const body = parsed.value as Record<string, unknown>;

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const rawUserId = body.userId;
  const userId: string | null | undefined =
    rawUserId === null
      ? null
      : typeof rawUserId === "string"
        ? rawUserId.trim()
        : undefined;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  if (!companyId) {
    return NextResponse.json(
      { ok: false, code: "MISSING_COMPANY_ID", message: "companyId es requerido." },
      { status: 400 }
    );
  }

  if (userId === undefined) {
    return NextResponse.json(
      { ok: false, code: "INVALID_USER_ID", message: "userId debe ser un string o null." },
      { status: 400 }
    );
  }

  // Verify companyId exists in proto_companies for workspace
  const { data: company } = await supabase
    .from("proto_companies")
    .select("id")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("id", companyId)
    .maybeSingle();

  if (!company) {
    return NextResponse.json(
      { ok: false, code: "COMPANY_NOT_FOUND", message: "El cliente no existe en el workspace." },
      { status: 404 }
    );
  }

  // Unassign case
  if (userId === null) {
    try {
      await unassignOperationalOwner(supabase, tenantCompanyId, companyId);
      return NextResponse.json({ ok: true, companyId, assignedTo: null });
    } catch {
      return copilotInternalErrorResponse();
    }
  }

  // Assign case: verify target user is active and assignable
  const { data: userRow } = await supabase
    .from("app_users")
    .select("id, full_name, email, role, is_active")
    .eq("company_id", tenantCompanyId)
    .eq("id", userId)
    .maybeSingle();

  if (!userRow) {
    return NextResponse.json(
      { ok: false, code: "USER_NOT_FOUND", message: "El usuario no existe en el workspace." },
      { status: 404 }
    );
  }

  const u = userRow as AssignableUserRow;

  if (u.is_active === false) {
    return NextResponse.json(
      {
        ok: false,
        code: "USER_INACTIVE",
        message: "El usuario está inactivo y no puede recibir asignaciones.",
      },
      { status: 422 }
    );
  }

  if (u.role === "demo_readonly") {
    return NextResponse.json(
      {
        ok: false,
        code: "USER_NOT_ASSIGNABLE",
        message: "Este usuario no puede recibir asignaciones de cobranza.",
      },
      { status: 422 }
    );
  }

  try {
    await assignOperationalOwner(supabase, tenantCompanyId, {
      customerId: companyId,
      assignedUserId: userId,
      assignedBy: appUser.id,
      note,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      assignedTo: {
        id: u.id,
        name: u.full_name?.trim() || u.email,
        email: u.email,
      },
    });
  } catch {
    return copilotInternalErrorResponse();
  }
}
