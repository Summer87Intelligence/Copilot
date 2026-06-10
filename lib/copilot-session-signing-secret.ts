/**
 * Resolución de secret para firma de cookie — sin crypto (Node + Edge safe).
 */

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
