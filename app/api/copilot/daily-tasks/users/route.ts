import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import { isTaskAdmin } from "@/lib/tasks/task-visibility";

export const dynamic = "force-dynamic";

export type TaskAssignableUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active: boolean;
};

/**
 * Usuarios asignables del workspace. Un no-admin solo puede autoasignarse, así que
 * recibe únicamente su propia ficha (evita cargar el roster completo — §28).
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const viewer = await buildTaskViewer(supabase, appUser);

  if (!isTaskAdmin(viewer)) {
    return NextResponse.json({
      ok: true as const,
      data: [
        {
          id: appUser.id,
          full_name: appUser.full_name ?? null,
          email: appUser.email ?? null,
          role: appUser.role ?? null,
          active: true,
        },
      ] as TaskAssignableUser[],
    });
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, email, role, deleted_at")
    .eq("company_id", tenantCompanyId)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar los usuarios." },
      { status: 500 }
    );
  }

  const users: TaskAssignableUser[] = ((data ?? []) as Array<Record<string, unknown>>).map((u) => ({
    id: String(u.id),
    full_name: (u.full_name as string) ?? null,
    email: (u.email as string) ?? null,
    role: (u.role as string) ?? null,
    active: !u.deleted_at,
  }));

  return NextResponse.json({ ok: true as const, data: users });
}
