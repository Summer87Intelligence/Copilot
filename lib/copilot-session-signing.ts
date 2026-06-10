/**
 * Firma HMAC-SHA256 para cookie `copilot_session` (P1-002 / Fase 5).
 *
 * Producción: exige `COPILOT_SESSION_SIGNING_SECRET`.
 * Test/dev no-prod: fallback explícito con nombre fijo (no generar en runtime).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Fallback explícito — solo entornos no-producción (tests / dev local). */
export const COPILOT_SESSION_TEST_SIGNING_SECRET =
  "copilot-session-test-signing-secret-v1-not-for-production";

export class CopilotSessionSigningSecretMissingError extends Error {
  constructor() {
    super("COPILOT_SESSION_SIGNING_SECRET is required in production.");
    this.name = "CopilotSessionSigningSecretMissingError";
  }
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Secret para firmar en login — falla en producción si falta env. */
export function requireCopilotSessionSigningSecret(): string {
  const fromEnv = process.env.COPILOT_SESSION_SIGNING_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (isProductionEnv()) {
    throw new CopilotSessionSigningSecretMissingError();
  }
  return COPILOT_SESSION_TEST_SIGNING_SECRET;
}

/** Secret para verificar — null si producción sin env (rechazar cookies). */
export function getCopilotSessionSigningSecretForVerify(): string | null {
  const fromEnv = process.env.COPILOT_SESSION_SIGNING_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (isProductionEnv()) return null;
  return COPILOT_SESSION_TEST_SIGNING_SECRET;
}

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

/** Verificación async (Web Crypto) para Edge middleware. */
export async function verifyCopilotSessionSignatureAsync(
  payload: string,
  signatureHex: string,
  secret: string
): Promise<boolean> {
  if (!signatureHex || !/^[0-9a-f]+$/i.test(signatureHex)) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = hexToBytes(signatureHex);
    if (!sigBytes) return false;
    const sigBuffer = new ArrayBuffer(sigBytes.length);
    new Uint8Array(sigBuffer).set(sigBytes);
    return crypto.subtle.verify("HMAC", key, sigBuffer, enc.encode(payload));
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i / 2] = byte;
  }
  return bytes;
}
