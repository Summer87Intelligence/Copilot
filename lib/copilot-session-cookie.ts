/**
 * Sesión Copilot vía cookie HttpOnly `copilot_session` — Node.js / server routes.
 *
 * Formato firmado (Fase 5 / P1-002):
 * `{userId}:{role}:{companyId}:{credentialVersion}.{hmacSha256Hex}`
 *
 * Middleware: usar `lib/copilot-session-cookie-edge.ts` (Web Crypto).
 */

import type { NextRequest } from "next/server";

import {
  buildCopilotSessionPayload,
  COPILOT_SESSION_COOKIE,
  isValidCompanyIdUuid,
  parseUnsignedPayload,
  splitSignedCookieValue,
  type ParsedCopilotSession,
} from "@/lib/copilot-session-payload";
import {
  getCopilotSessionSigningSecretForVerify,
  requireCopilotSessionSigningSecret,
} from "@/lib/copilot-session-signing-secret";
import {
  signCopilotSessionPayload,
  verifyCopilotSessionSignature,
} from "@/lib/copilot-session-signing";

export { COPILOT_SESSION_COOKIE, type ParsedCopilotSession };

/**
 * Serializa y firma el valor de `copilot_session`.
 * Requiere companyId (tenant canónico en login).
 */
export function serializeCopilotSessionValue(
  userId: string,
  role: string,
  companyId?: string,
  credentialVersion?: number
): string {
  const cid = companyId?.trim();
  if (!isValidCompanyIdUuid(cid)) {
    throw new Error("serializeCopilotSessionValue requires a valid companyId UUID.");
  }
  const rawCv =
    credentialVersion !== undefined && Number.isFinite(credentialVersion)
      ? Math.floor(Number(credentialVersion))
      : 1;
  const payload = buildCopilotSessionPayload(userId, role, cid!, rawCv);
  const secret = requireCopilotSessionSigningSecret();
  const signature = signCopilotSessionPayload(payload, secret);
  return `${payload}.${signature}`;
}

/**
 * Parsea y verifica firma (sync — Node / tests / server components).
 */
export function parseCopilotSessionValue(
  raw: string | undefined | null
): ParsedCopilotSession | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  const signed = splitSignedCookieValue(t);
  if (!signed) return null;

  const secret = getCopilotSessionSigningSecretForVerify();
  if (!secret) return null;
  if (!verifyCopilotSessionSignature(signed.payload, signed.signature, secret)) {
    return null;
  }

  return parseUnsignedPayload(signed.payload);
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
