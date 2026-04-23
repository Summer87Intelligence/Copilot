import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { COPILOT_SESSION_COOKIE, parseCopilotSessionValue } from "@/lib/copilot-session-cookie";

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Misma fuente de verdad que `app/copilot/layout.tsx` para mostrar el bloque Admin.
 */
export async function getCopilotIsSuperadminServer(): Promise<boolean> {
  const cookieStore = await cookies();
  const parsed = parseCopilotSessionValue(
    cookieStore.get(COPILOT_SESSION_COOKIE)?.value
  );
  if (!parsed) return false;

  const admin = createServiceRoleClient();
  if (!admin) return false;

  const { data: row, error } = await admin
    .from("app_users")
    .select("role, company_id")
    .eq("id", parsed.userId)
    .maybeSingle();

  if (error || !row) return false;
  const r = row as { role: string | null; company_id: string | null };
  if (!String(r.company_id ?? "").trim()) return false;
  return String(r.role ?? "").trim().toLowerCase() === "superadmin";
}
