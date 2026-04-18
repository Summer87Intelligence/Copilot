import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { CopilotMainWithReadingPanel } from "@/components/copilot/copilot-main-with-reading-panel";
import { CopilotShell } from "@/components/copilot/copilot-shell";
import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import {
  COPILOT_SESSION_COOKIE,
  parseCopilotSessionValue,
} from "@/lib/copilot-session-cookie";

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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Summer87 Copilot · Prototipo",
  description:
    "Gestión operativa con datos reales (Supabase). La entrada principal es / y redirige a este módulo.",
};

export default async function CopilotModuleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const parsed = parseCopilotSessionValue(
    cookieStore.get(COPILOT_SESSION_COOKIE)?.value
  );

  let isSuperadmin = false;
  let sessionPreview: CopilotSessionPreview | null = null;

  if (parsed) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data: row, error } = await admin
        .from("app_users")
        .select("id, company_id, username, email, role")
        .eq("id", parsed.userId)
        .maybeSingle();

      if (!error && row && (row as { id: string }).id) {
        const r = row as {
          id: string;
          company_id: string | null;
          username: string | null;
          email: string | null;
          role: string | null;
        };
        const role = String(r.role ?? "").trim();
        const tenantCompanyId = String(r.company_id ?? "").trim();

        if (!tenantCompanyId) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[copilot/layout] app_users sin company_id", r.id);
          }
        } else {
          isSuperadmin = role.toLowerCase() === "superadmin";
          const displayLogin =
            (r.username && r.username.trim()) ||
            (r.email && r.email.trim()) ||
            parsed.userId;

          sessionPreview = {
            displayEmail: displayLogin,
            displayRole: role || "user",
            tenantCompanyId,
          };
        }
      }
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[copilot/layout]", {
      hasCookie: Boolean(parsed),
      isSuperadmin,
      tenantCompanyId: sessionPreview?.tenantCompanyId ?? null,
      sessionPreview,
    });
  }

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col">
      <CopilotShell
        isSuperadmin={isSuperadmin}
        sessionPreview={sessionPreview}
      >
        <CopilotMainWithReadingPanel>{children}</CopilotMainWithReadingPanel>
      </CopilotShell>
    </div>
  );
}
