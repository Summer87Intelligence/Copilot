/**
 * Historial de Banco (bank_statement_imports) y saldos de cuenta
 * (metadata.balance) deben quedar bloqueados/ sanitizados para
 * inflow_readonly (Camila) a nivel servidor — no solo ocultos en la UI.
 *
 * Sesión real: usa el user_id real de Camila (bank_movements=inflow_readonly
 * en app_user_permissions, confirmado por lectura directa, sin modificar
 * datos) para firmar una cookie de sesión de test válida.
 */
import { expect, test } from "@playwright/test";
import { applyCopilotSessionCookie } from "./copilot-session-helper";

const CAMI_USER_ID = "ed980d62-a16c-4217-aa60-1c78cb023240";
const CAMI_COMPANY_ID = "040321ff-10fd-4da3-aeca-f1865f879986";

async function loginAsCami(context: import("@playwright/test").BrowserContext, baseURL: string) {
  await applyCopilotSessionCookie(context, baseURL, {
    userId: CAMI_USER_ID,
    role: "usuario",
    companyId: CAMI_COMPANY_ID,
    credentialVersion: 1,
  });
}

async function fetchJson(page: import("@playwright/test").Page, url: string) {
  return page.evaluate(async (u) => {
    const res = await fetch(u);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  }, url);
}

function containsBalanceKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBalanceKey);
  if (value && typeof value === "object") {
    if ("balance" in (value as Record<string, unknown>)) return true;
    return Object.values(value as Record<string, unknown>).some(containsBalanceKey);
  }
  return false;
}

test.describe("Banco — Historial bloqueado y saldos sanitizados a nivel API (Camila)", () => {
  test("GET /imports (Historial) responde 403 para Camila, sin filas ni metadata", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const { status, body } = await fetchJson(page, "/api/copilot/bank-movements/imports");
    expect(status).toBe(403);
    expect(body).toMatchObject({ ok: false, code: "FORBIDDEN_MODULE" });
    expect(JSON.stringify(body)).not.toMatch(/file_name|row_count|imported_at|opening_balance|closing_balance/);
  });

  test("Camila puede leer solo el timestamp del encabezado, sin abrir Historial", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const { status, body } = await fetchJson(
      page,
      "/api/copilot/bank-movements/imports/latest-successful"
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: { imported_at: expect.any(String) },
    });
    expect(Object.keys((body as { data: Record<string, unknown> }).data)).toEqual(["imported_at"]);
    await expect(page.getByTestId("bank-last-import-updated-at")).toContainText(
      "Última actualización"
    );
  });

  test("GET /imports responde 200 con listado real para superadmin (sin regresión)", async ({
    page,
    context,
    baseURL,
  }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const { status, body } = await fetchJson(page, "/api/copilot/bank-movements/imports");
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(Array.isArray((body as { data: unknown[] }).data)).toBe(true);
  });

  test("endpoint auxiliar de Historial (client-identifications/recent) también 403 para Camila", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const { status, body } = await fetchJson(
      page,
      "/api/copilot/bank-reconciliation/client-identifications/recent?limit=50"
    );
    expect(status).toBe(403);
    expect(body).toMatchObject({ ok: false, code: "FORBIDDEN_MODULE" });
  });

  test("GET /bank-movements (Movimientos) sigue en 200 para Camila, sin metadata.balance en ninguna fila", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const { status, body } = await fetchJson(page, "/api/copilot/bank-movements");
    expect(status).toBe(200);
    const json = body as { ok: boolean; data: Array<{ metadata?: Record<string, unknown> | null }> };
    expect(json.ok).toBe(true);
    expect(containsBalanceKey(json.data)).toBe(false);
  });

  test("GET /bank-movements/[id] (detalle) sin metadata.balance para Camila", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const list = await fetchJson(page, "/api/copilot/bank-movements");
    const rows = (list.body as { data: Array<{ id: string }> }).data;
    test.skip(rows.length === 0, "no hay movimientos inflow para esta empresa en este entorno");

    const { status, body } = await fetchJson(page, `/api/copilot/bank-movements/${rows[0]!.id}`);
    expect(status).toBe(200);
    expect(containsBalanceKey((body as { data: unknown }).data)).toBe(false);
  });

  test("GET /reconciliation (Motor A — Tesorería, exclusivo de egresos) para Camila: siempre vacío, ningún egreso en filas/counts/metadata", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    for (const qs of ["", "?direction=inflow", "?direction=outflow"]) {
      const { status, body } = await fetchJson(page, `/api/copilot/bank-movements/reconciliation${qs}`);
      expect(status, `status para query "${qs}"`).toBe(200);
      const json = body as {
        ok: boolean;
        data: { items: unknown[]; meta: Record<string, number> };
      };
      expect(json.ok, `ok para query "${qs}"`).toBe(true);
      expect(json.data.items, `items para query "${qs}"`).toEqual([]);
      expect(json.data.meta, `meta para query "${qs}"`).toEqual({
        pending_count: 0,
        with_high_confidence: 0,
        with_medium_confidence: 0,
        without_suggestions: 0,
        matched_count: 0,
        ignored_count: 0,
      });
      expect(containsBalanceKey(json.data)).toBe(false);
    }
  });

  test("GET /reconciliation para superadmin: sigue devolviendo egresos normalmente (sin regresión)", async ({
    page,
    context,
    baseURL,
  }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const { status, body } = await fetchJson(page, "/api/copilot/bank-movements/reconciliation");
    expect(status).toBe(200);
    const json = body as { ok: boolean; data: { items: Array<{ movement: { direction: string } }> } };
    expect(json.ok).toBe(true);
    // No hace ninguna afirmación sobre haber datos (depende del workspace),
    // pero si hay filas, todas deben ser egresos — nunca ingresos — porque
    // Motor A es exclusivamente de egresos para TODOS los usuarios.
    expect(json.data.items.every((item) => item.movement.direction === "outflow")).toBe(true);

    const outflowRes = await fetchJson(page, "/api/copilot/bank-movements/reconciliation?direction=outflow");
    expect(outflowRes.status).toBe(200);
  });

  test("Movimientos sigue funcionando para Camila (sin regresión de la restricción de tabs)", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    await expect(page.getByRole("heading", { name: "Movimientos del banco" })).toBeVisible({
      timeout: 45_000,
    });
    const nav = page.locator("[data-bank-tabs]");
    await expect(nav.getByRole("button")).toHaveCount(1);
    await expect(nav.getByRole("button", { name: "Movimientos" })).toBeVisible();
  });
});
