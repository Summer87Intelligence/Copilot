/**
 * Verificación de cookie `copilot_session` — Edge Runtime (middleware).
 * Sin node:crypto ni imports Node-only.
 */

import {
  parseUnsignedPayload,
  splitSignedCookieValue,
  type ParsedCopilotSession,
} from "@/lib/copilot-session-payload";
import { getCopilotSessionSigningSecretForVerify } from "@/lib/copilot-session-signing-secret";
import { verifyCopilotSessionSignatureEdge } from "@/lib/copilot-session-signing-edge";

export { COPILOT_SESSION_COOKIE, type ParsedCopilotSession } from "@/lib/copilot-session-payload";

/** Parsea y verifica firma (async — Edge middleware). */
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

  const ok = await verifyCopilotSessionSignatureEdge(
    signed.payload,
    signed.signature,
    secret
  );
  if (!ok) return null;

  return parseUnsignedPayload(signed.payload);
}

export async function isValidCopilotSessionCookieAsync(
  raw: string | undefined | null
): Promise<boolean> {
  return (await parseCopilotSessionValueAsync(raw)) != null;
}
