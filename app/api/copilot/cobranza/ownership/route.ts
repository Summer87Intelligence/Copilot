import { type NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export async function GET(req: NextRequest) {
  const auth = await requireCopilotModuleAccess(req, "cobranza");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;

  const { data: stateRows, error } = await supabase
    .from("decision_operational_state")
    .select("customer_id, assigned_user_id")
    .eq("workspace_company_id", tenantCompanyId)
    .not("assigned_user_id", "is", null);

  if (error) return copilotInternalErrorResponse();

  const rows = (stateRows ?? []) as Array<{ customer_id: string; assigned_user_id: string }>;

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, ownership: {} });
  }

  const userIds = [...new Set(rows.map((r) => r.assigned_user_id))];
  const { data: userRows } = await supabase
    .from("app_users")
    .select("id, full_name, email")
    .in("id", userIds);

  const userMap = new Map<string, { name: string; email: string }>();
  for (const u of (userRows ?? []) as Array<{ id: string; full_name: string; email: string }>) {
    userMap.set(u.id, {
      name: u.full_name?.trim() || u.email?.trim() || "Usuario",
      email: u.email ?? "",
    });
  }

  const ownership: Record<string, { userId: string; name: string; email: string }> = {};
  for (const row of rows) {
    const user = userMap.get(row.assigned_user_id);
    if (user) {
      ownership[row.customer_id] = {
        userId: row.assigned_user_id,
        name: user.name,
        email: user.email,
      };
    }
  }

  return NextResponse.json({ ok: true, ownership });
}
