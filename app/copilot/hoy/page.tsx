import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HoyPageClient } from "@/components/copilot/hoy/hoy-page-client";
import { COPILOT_SESSION_COOKIE, parseCopilotSessionValue } from "@/lib/copilot-session-cookie";
import { getDefaultLandingForUser } from "@/lib/auth/default-landing";
import {
  getServerEffectivePermissions,
  isModuleAccessDenied,
} from "@/lib/auth/server-module-permissions";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("hoy")) {
    // USER-ACCESS-LANDING-PERMISSIONS-001: Hoy es el dashboard ejecutivo,
    // reservado a admin/acceso total. Sin ese permiso, redirigir al landing
    // correcto en vez de mostrar un 403 genérico.
    const cookieStore = await cookies();
    const parsed = parseCopilotSessionValue(cookieStore.get(COPILOT_SESSION_COOKIE)?.value);
    const modulePermissions = (await getServerEffectivePermissions()) ?? {};
    redirect(getDefaultLandingForUser(parsed?.role ?? "", modulePermissions));
  }
  return <HoyPageClient />;
}
