import { expect, test } from "@playwright/test";

/**
 * FASE 1 — `proxy.ts` (Next 16 equivalente de middleware) cierra acceso
 * anónimo a rutas privadas. /copilot/* y /api/copilot/* ya estaban cubiertos
 * desde antes; en esta fase agregamos /admin/* y /account.
 *
 * Verificamos comportamiento sin sesión:
 *   - /copilot/dashboard  → redirect → /login?next=/copilot/dashboard
 *   - /copilot/cartera    → redirect → /login?next=/copilot/cartera
 *   - /admin/companies    → redirect → /login?next=/admin/companies
 *   - /account            → redirect → /login?next=/account
 *   - /login              → 200 (sigue público)
 *
 * NO valida el flujo de login (fuera de scope de FASE 1).
 */
test.describe("FASE 1 · proxy.ts redirige anónimos", () => {
  test("redirige /copilot/dashboard a /login preservando next", async ({ request }) => {
    const res = await request.get("/copilot/dashboard", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(307);
    const loc = res.headers()["location"];
    expect(loc).toBeTruthy();
    expect(loc).toMatch(/\/login\?next=%2Fcopilot%2Fdashboard$/);
  });

  test("redirige /copilot/cartera a /login preservando next", async ({ request }) => {
    const res = await request.get("/copilot/cartera", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login\?next=%2Fcopilot%2Fcartera$/);
  });

  test("redirige /admin a /login", async ({ request }) => {
    const res = await request.get("/admin/companies", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login\?next=%2Fadmin%2Fcompanies$/);
  });

  test("redirige /account a /login", async ({ request }) => {
    const res = await request.get("/account", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login\?next=%2Faccount$/);
  });

  test("/login permanece accesible sin sesión", async ({ request }) => {
    const res = await request.get("/login", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
  });
});
