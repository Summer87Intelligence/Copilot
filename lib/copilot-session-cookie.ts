/**
 * Sesión Copilot vía cookie HttpOnly `copilot_session`.
 *
 * Formatos:
 * - Legado 2: `{userId}:{role}` → companyId null, credentialVersion 1
 * - Legado 3: `{userId}:{role}:{companyId}` (UUID) → credentialVersion 1
 * - SECURITY-02: `{userId}:{role}:{companyId}:{credentialVersion}` (entero ≥1)
 */

import type { NextRequest } from "next/server";

export const COPILOT_SESSION_COOKIE = "copilot_session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CREDENTIAL_VERSION_RE = /^\d+$/;

export type ParsedCopilotSession = {
  userId: string;
  role: string;
  /** Null si cookie legado de dos segmentos; tenant canónico en servidor vía `app_users`. */
  companyId: string | null;
  /** SECURITY-02: versión de credencial; legado sin sufijo ⇒ 1 */
  credentialVersion: number;
};

export function serializeCopilotSessionValue(
  userId: string,
  role: string,
  companyId?: string,
  credentialVersion?: number
): string {
  const rid = role.trim() || "user";
  const cid = companyId?.trim();
  if (cid) {
    const rawCv =
      credentialVersion !== undefined && Number.isFinite(credentialVersion)
        ? Math.floor(Number(credentialVersion))
        : 1;
    const cv = Math.max(1, rawCv);
    return `${userId}:${rid}:${cid}:${cv}`;
  }
  return `${userId}:${rid}`;
}

/**
 * Parsea el valor de `copilot_session` (2, 3 o 4+ segmentos con versión final numérica).
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
    return { userId, role, companyId: null, credentialVersion: 1 };
  }

  const last = parts[parts.length - 1]!;
  const maybeCv =
    CREDENTIAL_VERSION_RE.test(last) && parts.length >= 4
      ? Number.parseInt(last, 10)
      : null;

  if (maybeCv != null && Number.isFinite(maybeCv) && maybeCv >= 1) {
    const companyId = parts[parts.length - 2]!;
    if (!UUID_RE.test(companyId)) return null;
    const role = parts.slice(1, -2).join(":").trim();
    if (!role) return null;
    return { userId, role, companyId, credentialVersion: maybeCv };
  }

  const companyId = parts[parts.length - 1]!;
  const role = parts.slice(1, -1).join(":").trim();
  if (!role || !UUID_RE.test(companyId)) return null;
  return { userId, role, companyId, credentialVersion: 1 };
}

export function isValidCopilotSessionCookie(
  raw: string | undefined | null
): boolean {
  return parseCopilotSessionValue(raw) != null;
}

export function getParsedCopilotSessionFromRequest(
  request: NextRequest
): ParsedCopilotSession | null {
  return parseCopilotSessionValue(
    request.cookies.get(COPILOT_SESSION_COOKIE)?.value
  );
}
