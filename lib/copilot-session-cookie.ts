/**
 * Sesión Copilot vía cookie HttpOnly `copilot_session`.
 *
 * Formato firmado (Fase 5 / P1-002):
 * `{userId}:{role}:{companyId}:{credentialVersion}.{hmacSha256Hex}`
 *
 * Cookies legadas sin firma → rechazadas (logout forzado al revalidar).
 */

import type { NextRequest } from "next/server";

import {
  getCopilotSessionSigningSecretForVerify,
  requireCopilotSessionSigningSecret,
  signCopilotSessionPayload,
  verifyCopilotSessionSignature,
  verifyCopilotSessionSignatureAsync,
} from "@/lib/copilot-session-signing";

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

function splitSignedCookieValue(raw: string): { payload: string; signature: string } | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  return {
    payload: raw.slice(0, dot),
    signature: raw.slice(dot + 1),
  };
}

function parseUnsignedPayload(payload: string): ParsedCopilotSession | null {
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

function buildPayload(
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
  if (!cid || !UUID_RE.test(cid)) {
    throw new Error("serializeCopilotSessionValue requires a valid companyId UUID.");
  }
  const rawCv =
    credentialVersion !== undefined && Number.isFinite(credentialVersion)
      ? Math.floor(Number(credentialVersion))
      : 1;
  const payload = buildPayload(userId, role, cid, rawCv);
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

/** Parse async para Edge middleware. */
export async function parseCopilotSessionValueAsync(
  raw: string | undefined | null
): Promise<ParsedCopilotSession | null> {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  const signed = splitSignedCookieValue(t);
  if (!signed) return null;

  const secret = getCopilotSessionSigningSecretForVerify();
  if (!secret) return null;
  const ok = await verifyCopilotSessionSignatureAsync(
    signed.payload,
    signed.signature,
    secret
  );
  if (!ok) return null;

  return parseUnsignedPayload(signed.payload);
}

export function isValidCopilotSessionCookie(
  raw: string | undefined | null
): boolean {
  return parseCopilotSessionValue(raw) != null;
}

export async function isValidCopilotSessionCookieAsync(
  raw: string | undefined | null
): Promise<boolean> {
  return (await parseCopilotSessionValueAsync(raw)) != null;
}

export function getParsedCopilotSessionFromRequest(
  request: NextRequest
): ParsedCopilotSession | null {
  return parseCopilotSessionValue(
    request.cookies.get(COPILOT_SESSION_COOKIE)?.value
  );
}
