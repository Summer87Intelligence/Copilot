/**
 * Sesión Copilot vía cookie HttpOnly `copilot_session`.
 * Formato valor: `{uuid}:{role}` (sin JWT; el rol se revalida en layout contra DB).
 */

export const COPILOT_SESSION_COOKIE = "copilot_session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedCopilotSession = {
  userId: string;
  role: string;
};

export function serializeCopilotSessionValue(userId: string, role: string): string {
  return `${userId}:${role}`;
}

export function parseCopilotSessionValue(
  raw: string | undefined | null
): ParsedCopilotSession | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  const i = t.indexOf(":");
  if (i <= 0 || i >= t.length - 1) return null;
  const userId = t.slice(0, i);
  const role = t.slice(i + 1).trim();
  if (!UUID_RE.test(userId) || !role) return null;
  return { userId, role };
}

export function isValidCopilotSessionCookie(
  raw: string | undefined | null
): boolean {
  return parseCopilotSessionValue(raw) != null;
}
