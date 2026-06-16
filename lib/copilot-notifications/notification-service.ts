import type { SupabaseClient } from "@supabase/supabase-js";
import type { CopilotNotification, NotificationListResponse } from "./notification-types";

export async function listNotifications(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {}
): Promise<NotificationListResponse> {
  const limit = Math.min(opts.limit ?? 50, 100);

  let listQuery = supabase
    .from("copilot_notifications")
    .select("*")
    .eq("workspace_company_id", tenantCompanyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.unreadOnly) {
    listQuery = listQuery.is("read_at", null);
  }

  const [{ data, error: listError }, { count, error: countError }] = await Promise.all([
    listQuery,
    supabase
      .from("copilot_notifications")
      .select("*", { count: "exact", head: true })
      .eq("workspace_company_id", tenantCompanyId)
      .is("read_at", null),
  ]);

  if (listError) throw listError;

  if (countError && process.env.NODE_ENV !== "production") {
    console.warn("[notifications] unread count query failed:", countError.message);
  }

  return {
    ok: true,
    notifications: (data as CopilotNotification[]) ?? [],
    unreadCount: countError ? 0 : (count ?? 0),
  };
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<boolean> {
  const { error } = await supabase
    .from("copilot_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .is("read_at", null);

  return !error;
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("copilot_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_company_id", tenantCompanyId)
    .is("read_at", null);

  return !error;
}
