import { createClient } from "@supabase/supabase-js";
import type { CreateNotificationInput } from "./notification-types";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function createCopilotNotification(
  tenantCompanyId: string,
  input: CreateNotificationInput
): Promise<{ ok: boolean; id?: string }> {
  const admin = getAdminClient();
  if (!admin) {
    console.warn("[create-notification] no service role client — missing env vars");
    return { ok: false };
  }

  const { data, error } = await admin
    .from("copilot_notifications")
    .insert({
      workspace_company_id: tenantCompanyId,
      type: input.type,
      severity: input.severity ?? "info",
      title: input.title,
      body: input.body ?? null,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      action_href: input.action_href ?? null,
      dedup_key: input.dedup_key ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("[create-notification] insert error", error.code, error.message);
    return { ok: false };
  }

  return { ok: true, id: (data as { id: string } | null)?.id };
}

/**
 * Idempotente: crea la notificación solo si no existe ya una con ese dedup_key
 * para el mismo workspace. Seguro de llamar desde crons que se ejecutan repetidamente.
 */
export async function createNotificationIfNotExists(
  tenantCompanyId: string,
  input: CreateNotificationInput & { dedup_key: string }
): Promise<{ ok: boolean; created: boolean; id?: string }> {
  const admin = getAdminClient();
  if (!admin) return { ok: false, created: false };

  const { data: existing } = await admin
    .from("copilot_notifications")
    .select("id")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("dedup_key", input.dedup_key)
    .maybeSingle();

  if (existing) {
    return { ok: true, created: false, id: (existing as { id: string }).id };
  }

  const result = await createCopilotNotification(tenantCompanyId, input);
  return { ...result, created: result.ok };
}
