/**
 * SECURITY-02: inserción de eventos de auditoría de login (service_role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthLoginFailureReason =
  | "invalid_credentials"
  | "account_locked"
  | "rate_limited"
  | "session_credentials_stale"
  | "internal_error";

export type InsertAuthLoginEventInput = {
  userId: string | null;
  companyId: string | null;
  success: boolean;
  failureReason: AuthLoginFailureReason | null;
  ip: string | null;
  userAgent: string | null;
};

export function logAuthStructured(
  kind: string,
  payload: Record<string, unknown>
): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "copilot_auth",
      kind,
      ...payload,
    })
  );
}

export async function insertAuthLoginEvent(
  admin: SupabaseClient,
  input: InsertAuthLoginEventInput
): Promise<void> {
  const row = {
    user_id: input.userId,
    company_id: input.companyId,
    success: input.success,
    failure_reason: input.failureReason,
    ip: input.ip,
    user_agent: input.userAgent,
  };
  const { error } = await admin.from("auth_login_events").insert(row);
  if (error) {
    logAuthStructured("auth_login_event_insert_error", {
      message: error.message,
      success: input.success,
    });
  }
}
