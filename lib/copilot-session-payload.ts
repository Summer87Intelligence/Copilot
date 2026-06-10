/**
 * Payload común de cookie `copilot_session` — sin crypto (Node + Edge safe).
 *
 * Formato: `{userId}:{role}:{companyId}:{credentialVersion}.{hmacSha256Hex}`
 */

export const COPILOT_SESSION_COOKIE = "copilot_session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CREDENTIAL_VERSION_RE = /^\d+$/;

export type ParsedCopilotSession = {
  userId: string;
  role: string;
  companyId: string | null;
  credentialVersion: number;
};

export function splitSignedCookieValue(
  raw: string
): { payload: string; signature: string } | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  return {
    payload: raw.slice(0, dot),
    signature: raw.slice(dot + 1),
  };
}

export function parseUnsignedPayload(payload: string): ParsedCopilotSession | null {
  const parts = payload.split(":");
  if (parts.length !== 4) return null;

  const userId = parts[0]!;
  const role = parts[1]!.trim();
  const companyId = parts[2]!;
  const cvRaw = parts[3]!;

  if (!UUID_RE.test(userId) || !role || !UUID_RE.test(companyId)) return null;
  if (!CREDENTIAL_VERSION_RE.test(cvRaw)) return null;

  const credentialVersion = Number.parseInt(cvRaw, 10);
  if (!Number.isFinite(credentialVersion) || credentialVersion < 1) return null;

  return { userId, role, companyId, credentialVersion };
}

export function buildCopilotSessionPayload(
  userId: string,
  role: string,
  companyId: string,
  credentialVersion: number
): string {
  const rid = role.trim() || "user";
  const cid = companyId.trim();
  const cv = Math.max(1, Math.floor(Number(credentialVersion)) || 1);
  return `${userId}:${rid}:${cid}:${cv}`;
}

export function isValidCompanyIdUuid(companyId: string | undefined): boolean {
  const cid = companyId?.trim();
  return Boolean(cid && UUID_RE.test(cid));
}
