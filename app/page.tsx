import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COPILOT_SESSION_COOKIE, parseCopilotSessionValue } from "@/lib/copilot-session-cookie";
import { getDefaultLandingForUser } from "@/lib/auth/default-landing";
import { getServerEffectivePermissions } from "@/lib/auth/server-module-permissions";

export default async function Home() {
  const cookieStore = await cookies();
  const parsed = parseCopilotSessionValue(cookieStore.get(COPILOT_SESSION_COOKIE)?.value);
  const modulePermissions = (await getServerEffectivePermissions()) ?? {};
  redirect(getDefaultLandingForUser(parsed?.role ?? "", modulePermissions));
}
