import { type NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

type AppUserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

export async function GET(req: NextRequest) {
  const auth = await requireCopilotModuleAccess(req, "acciones");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;

  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, email, role")
    .eq("company_id", tenantCompanyId)
    .eq("is_active", true)
    .neq("role", "demo_readonly")
    .order("full_name", { ascending: true });

  if (error) {
    return copilotInternalErrorResponse();
  }

  const users = ((data ?? []) as AppUserRow[]).map((u) => ({
    id: u.id,
    name: u.full_name?.trim() || u.email,
    email: u.email,
    role: u.role,
  }));

  return NextResponse.json({ ok: true, users });
}
