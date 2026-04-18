import type { Metadata } from "next";

import { CopilotMainWithReadingPanel } from "@/components/copilot/copilot-main-with-reading-panel";
import { CopilotShell } from "@/components/copilot/copilot-shell";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { getAppUserByEmail } from "@/services/app-user-source";

/** Sesión + rol superadmin deben resolverse siempre en request; evita RSC del layout servido desde caché con `isSuperadmin` viejo. */
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
  const supabase = await createRouteSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.trim();

  let appUser = null as Awaited<ReturnType<typeof getAppUserByEmail>>;
  let isSuperadmin = false;
  if (email) {
    appUser = await getAppUserByEmail(email, supabase);
    isSuperadmin =
      appUser?.role?.trim().toLowerCase() === "superadmin";
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[copilot/layout]", {
      isSuperadmin,
      appUserRole: appUser?.role ?? null,
      hasEmail: Boolean(email),
    });
  }

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col">
      <CopilotShell isSuperadmin={isSuperadmin}>
        <CopilotMainWithReadingPanel>{children}</CopilotMainWithReadingPanel>
      </CopilotShell>
    </div>
  );
}
