/**
 * Helper de sesión para e2e Playwright.
 *
 * Genera y aplica una cookie `copilot_session` firmada para los specs que
 * necesitan saltarse el middleware de auth y entrar como superadmin de prueba.
 *
 * NO reescribe la auth: usa el secret de test ya definido en
 * `lib/copilot-session-signing-secret.ts` y los helpers existentes para
 * payload + firma. Si querés correr e2e contra un entorno con secret real,
 * setea `COPILOT_SESSION_SIGNING_SECRET` antes de `npm run test:e2e`.
 */

import type { BrowserContext } from "@playwright/test";

import {
  COPILOT_SESSION_COOKIE,
  serializeCopilotSessionValue,
} from "@/lib/copilot-session-cookie";

/**
 * Identidad superadmin reservada para tests e2e. El mismo UUID se usa en
 * `scripts/ui-browser-qa.mjs` para mantener consistencia local.
 */
export const E2E_SUPERADMIN_USER_ID = "22535d5c-3c6d-4bc4-a9a1-550132a1819b";
export const E2E_SUPERADMIN_COMPANY_ID = "040321ff-10fd-4da3-aeca-f1865f879986";
export const E2E_SUPERADMIN_ROLE = "superadmin";
export const E2E_SUPERADMIN_CREDENTIAL_VERSION = 1;

export type E2eSessionOverrides = {
  userId?: string;
  role?: string;
  companyId?: string;
  credentialVersion?: number;
};

/** Aplica la cookie firmada `copilot_session` al contexto del browser. */
export async function applyCopilotSessionCookie(
  context: BrowserContext,
  baseUrl: string,
  overrides: E2eSessionOverrides = {}
): Promise<void> {
  const value = serializeCopilotSessionValue(
    overrides.userId ?? E2E_SUPERADMIN_USER_ID,
    overrides.role ?? E2E_SUPERADMIN_ROLE,
    overrides.companyId ?? E2E_SUPERADMIN_COMPANY_ID,
    overrides.credentialVersion ?? E2E_SUPERADMIN_CREDENTIAL_VERSION
  );
  const url = new URL(baseUrl);
  await context.addCookies([
    {
      name: COPILOT_SESSION_COOKIE,
      value,
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}
