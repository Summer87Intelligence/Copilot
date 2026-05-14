import type { BrowserContext, Page } from "@playwright/test";

function sessionCookieValue(): string {
  const value =
    process.env.PLAYWRIGHT_COPILOT_SESSION?.trim() ||
    process.env.COPILOT_E2E_SESSION?.trim() ||
    process.env.TREASURY_SMOKE_COOKIE?.trim();

  if (!value) {
    throw new Error(
      [
        "No hay sesión E2E configurada.",
        "Exportá PLAYWRIGHT_COPILOT_SESSION, COPILOT_E2E_SESSION o PLAYWRIGHT_COPILOT_USER + PLAYWRIGHT_COPILOT_PIN.",
      ].join(" ")
    );
  }
  return value;
}

export async function seedCopilotSessionCookie(
  context: BrowserContext,
  baseURL: string
): Promise<void> {
  await context.addCookies([
    {
      name: "copilot_session",
      value: sessionCookieValue(),
      url: baseURL.endsWith("/") ? baseURL : `${baseURL}/`,
    },
  ]);
}

export async function loginCopilotViaApi(page: Page): Promise<boolean> {
  const user = process.env.PLAYWRIGHT_COPILOT_USER?.trim();
  const pin = process.env.PLAYWRIGHT_COPILOT_PIN;
  if (!user || pin == null || pin === "") return false;

  const res = await page.request.post("/api/copilot/login", {
    data: { user, pin },
  });
  return res.ok();
}

export async function ensureCopilotSession(page: Page, baseURL: string): Promise<void> {
  const loggedIn = await loginCopilotViaApi(page);
  if (!loggedIn) {
    await seedCopilotSessionCookie(page.context(), baseURL);
  }

  const me = await page.request.get("/api/copilot/me");
  if (!me.ok()) {
    const body = await me.text().catch(() => "");
    throw new Error(
      [
        `Sesión Copilot inválida (${me.status()}) en ${baseURL}.`,
        "Configurá PLAYWRIGHT_COPILOT_SESSION o PLAYWRIGHT_COPILOT_USER / PLAYWRIGHT_COPILOT_PIN.",
        body ? `Respuesta: ${body}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
}
