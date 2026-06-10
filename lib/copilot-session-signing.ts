/**
 * Firma HMAC-SHA256 para cookie — Node.js (node:crypto).
 * No importar desde middleware / Edge.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export {
  COPILOT_SESSION_TEST_SIGNING_SECRET,
  CopilotSessionSigningSecretMissingError,
  getCopilotSessionSigningSecretForVerify,
  requireCopilotSessionSigningSecret,
} from "@/lib/copilot-session-signing-secret";

export function signCopilotSessionPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyCopilotSessionSignature(
  payload: string,
  signatureHex: string,
  secret: string
): boolean {
  if (!signatureHex || !/^[0-9a-f]+$/i.test(signatureHex)) return false;
  const expected = signCopilotSessionPayload(payload, secret);
  try {
    const a = Buffer.from(signatureHex, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
