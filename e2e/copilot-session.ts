import type { BrowserContext, Page } from "@playwright/test";

const DEFAULT_SESSION_COOKIE =
  "22535d5c-3c6d-4bc4-a9a1-550132a1819b:superadmin:040321ff-10fd-4da3-aeca-f1865f879986:1";

function sessionCookieValue(): string {
  return (
    process.env.PLAYWRIGHT_COPILOT_SESSION?.trim() ||
    process.env.COPILOT_E2E_SESSION?.trim() ||
    process.env.TREASURY_SMOKE_COOKIE?.trim() ||
    DEFAULT_SESSION_COOKIE
  );
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
  if (loggedIn) return;
  await seedCopilotSessionCookie(page.context(), baseURL);
}
