/**
 * Opciones unificadas para set/clear de `copilot_session` (login, logout, invalidación).
 * SECURITY-02: `secure` condicional + TTL configurable.
 */

import type { NextResponse } from "next/server";

import { COPILOT_SESSION_COOKIE } from "@/lib/copilot-session-cookie";

export function isCopilotProductionLike(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

/** Override explícito: "true" | "false"; si no hay env, usa producción-like. */
export function getCopilotSessionCookieSecure(): boolean {
  const raw = process.env.COPILOT_SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === "false") return false;
  if (raw === "true") return true;
  return isCopilotProductionLike();
}

export function getCopilotSessionMaxAgeSeconds(): number {
  const raw = process.env.SESSION_TTL_SECONDS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 300) {
    return n;
  }
  return 43_200;
}

export type CopilotSessionCookieSetOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

export function getCopilotSessionCookieSetOptions(): CopilotSessionCookieSetOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: getCopilotSessionCookieSecure(),
    path: "/",
    maxAge: getCopilotSessionMaxAgeSeconds(),
  };
}

export function getCopilotSessionCookieClearOptions(): CopilotSessionCookieSetOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: getCopilotSessionCookieSecure(),
    path: "/",
    maxAge: 0,
  };
}

/** Aplica clear cookie en una `NextResponse` (mismos flags que login). */
export function applyClearCopilotSessionCookie(res: NextResponse): void {
  res.cookies.set(COPILOT_SESSION_COOKIE, "", getCopilotSessionCookieClearOptions());
}
