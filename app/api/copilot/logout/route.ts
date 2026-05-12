import { NextResponse } from "next/server";

import { getCopilotSessionCookieClearOptions } from "@/lib/copilot-cookie-options";
import { COPILOT_SESSION_COOKIE } from "@/lib/copilot-session-cookie";

/**
 * POST /api/copilot/logout
 * Limpia la cookie HttpOnly de sesión Copilot (login usuario + PIN).
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COPILOT_SESSION_COOKIE, "", getCopilotSessionCookieClearOptions());
  return res;
}
