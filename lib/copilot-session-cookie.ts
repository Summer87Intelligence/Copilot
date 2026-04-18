/**
 * Sesión Copilot vía cookie HttpOnly `copilot_session`.
 * Formato actual: `{userId}:{role}:{companyId}` (UUIDs en extremos; rol sin `:`).
 * Formato legado (sigue aceptándose): `{userId}:{role}` → companyId = null hasta re-login.
 */

import type { NextRequest } from "next/server";

export const COPILOT_SESSION_COOKIE = "copilot_session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedCopilotSession = {
  userId: string;
  role: string;
  /** Null si cookie legado de dos segmentos; la fuente de verdad del tenant sigue siendo `app_users.company_id` en servidor. */
  companyId: string | null;
};

export function serializeCopilotSessionValue(
  userId: string,
  role: string,
  companyId?: string
): string {
  const rid = role.trim() || "user";
  const cid = companyId?.trim();
  if (cid) {
    return `${userId}:${rid}:${cid}`;
  }
  return `${userId}:${rid}`;
}

/**
 * Parsea el valor de `copilot_session`.
 * Acepta `uuid:role` (legado) o `uuid:role:uuid` con tenant.
 */
export function parseCopilotSessionValue(
  raw: string | undefined | null
): ParsedCopilotSession | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  const parts = t.split(":");
  if (parts.length < 2) return null;

  const userId = parts[0]!;
  if (!UUID_RE.test(userId)) return null;

  if (parts.length === 2) {
    const role = parts[1]!.trim();
    if (!role) return null;
    return { userId, role, companyId: null };
  }

  const companyId = parts[parts.length - 1]!;
  const role = parts.slice(1, -1).join(":").trim();
  if (!role || !UUID_RE.test(companyId)) return null;
  return { userId, role, companyId };
}

export function isValidCopilotSessionCookie(
  raw: string | undefined | null
): boolean {
  return parseCopilotSessionValue(raw) != null;
}

/** Middleware y route handlers (Request con cookies). */
export function getParsedCopilotSessionFromRequest(
  request: NextRequest
): ParsedCopilotSession | null {
  return parseCopilotSessionValue(
    request.cookies.get(COPILOT_SESSION_COOKIE)?.value
  );
}
