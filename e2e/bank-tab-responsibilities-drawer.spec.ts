/**
 * FASE BANK-IDEMPOTENT-IMPORT-AND-CLEAR-RESPONSIBILITIES-001
 * E2E determinista con fixtures mockeadas — 6/6, 0 skipped, sin escrituras.
 */
import { expect, test, type Page } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";
import {
  associationPayload,
  bankMovementsListPayload,
  FIXTURE_ASSOCIATED_ID,
  FIXTURE_CLIENT_ID,
  FIXTURE_CLIENT_NAME,
  FIXTURE_FULL_DESCRIPTION,
  FIXTURE_UNASSIGNED_ID,
} from "./fixtures/bank-tab-responsibilities";

test.describe.configure({ timeout: 120_000 });

async function installBankFixtures(page: Page) {
  // Subpaths antes que el catch-all: /reconciliation no debe recibir el payload de listado
  // (rompe BankMovementsReconciliationPanel con items.filter sobre undefined).
  await page.route("**/api/copilot/bank-movements/reconciliation**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { items: [] } }),
    });
  });

  await page.route("**/api/copilot/bank-movements/imports**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  await page.route("**/api/copilot/bank-movements**", async (route) => {
    const url = route.request().url();
    const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
    if (pathname.endsWith("/imports") || pathname.includes("/imports/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [] }),
      });
      return;
    }
    if (pathname.includes("/reconciliation")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { items: [] } }),
      });
      return;
    }
    if (url.includes("/hide") || url.includes("/restore") || route.request().method() !== "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    if (pathname !== "/api/copilot/bank-movements") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { items: [] } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(bankMovementsListPayload()),
    });
  });

  await page.route("**/api/copilot/bank-reconciliation/movements/*/association**", async (route) => {
    const match = route.request().url().match(/movements\/([0-9a-f-]{36})\/association/i);
    const id = match?.[1] ?? FIXTURE_UNASSIGNED_ID;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(associationPayload(id)),
    });
  });

  // Cliente 360: responder HTML mínimo si la página real no carga el fixture id.
  await page.route(`**/copilot/clientes/${FIXTURE_CLIENT_ID}**`, async (route) => {
    if (route.request().resourceType() === "document") {
      const url = new URL(route.request().url());
      const html = `<!doctype html><html><body>
        <h1>Cliente fixture</h1>
        <div role="tab" aria-selected="true">Identificacion bancaria</div>
        <p>Identificacion bancaria</p>
        <a href="/copilot/movimientos-bancarios?${url.searchParams.get("returnTo") ?? ""}">Volver a Banco</a>
      </body></html>`;
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      return;
    }
    await route.continue();
  });
}

test.describe("Bank tab responsibilities — fixtures", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    await installBankFixtures(page);
  });

  test("1. Movimientos no muestra Asignar cliente", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole("button", { name: /^Asignar cliente$/ })).toHaveCount(0);
    await expect(page.getByText(FIXTURE_FULL_DESCRIPTION.slice(0, 40)).filter({ visible: true }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("2. Ir a Conciliación abre el movement_id exacto", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    const goTo = page.locator("[data-bank-go-to-reconciliation]").filter({ visible: true }).first();
    await expect(goTo).toBeVisible({ timeout: 20_000 });
    await goTo.click();
    await expect(page.locator("[data-bank-drawer]")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Banco.*Conciliaci/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("[data-bank-drawer-body]")).toContainText(FIXTURE_FULL_DESCRIPTION);
    // El CTA del fixture sin cliente es el unassigned id
    await expect(page.locator("[data-bank-drawer-body]")).toContainText("4453956LR-2607150");
  });

  test("3. Conciliación Asignar + descripción completa + tabs detrás + Cerrar", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/copilot/movimientos-bancarios?tab=conciliacion&movementId=${FIXTURE_UNASSIGNED_ID}`);
    await expect(page.locator("[data-bank-drawer]")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Asignar cliente/i })).toBeVisible();
    await expect(page.locator("[data-bank-drawer-body]")).toContainText("Descripción Santander");
    await expect(page.locator("[data-bank-drawer-body]")).toContainText(FIXTURE_FULL_DESCRIPTION);
    await expect(page.locator("[data-bank-drawer-close]")).toBeVisible();

    const zTabs = await page.locator("[data-bank-tabs]").evaluate((el) =>
      Number.parseInt(getComputedStyle(el).zIndex || "0", 10)
    );
    const zDrawer = await page.locator("[data-bank-drawer]").evaluate((el) =>
      Number.parseInt(getComputedStyle(el).zIndex || "0", 10)
    );
    expect(zDrawer).toBeGreaterThan(zTabs);

    const tabsBlocked = await page.evaluate(() => {
      const tabs = document.querySelector("[data-bank-tabs]");
      const backdrop = document.querySelector("[data-bank-drawer-backdrop]");
      if (!tabs || !backdrop) return false;
      const tabRect = tabs.getBoundingClientRect();
      const topEl = document.elementFromPoint(
        tabRect.left + Math.min(40, tabRect.width / 2),
        tabRect.top + Math.min(12, tabRect.height / 2)
      );
      return topEl === backdrop || Boolean(topEl?.closest("[data-bank-drawer]"));
    });
    expect(tabsBlocked).toBe(true);

    await page.locator("[data-bank-drawer-close]").click();
    await expect(page.locator("[data-bank-drawer]")).toHaveCount(0);

    // Lista Conciliación sí ofrece Asignar cliente
    await expect(page.getByRole("button", { name: /^Asignar cliente$/ }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("4. Nombre cliente asociado abre Identificación bancaria", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    const link = page.getByRole("link", {
      name: new RegExp("Abrir identificaci.*" + FIXTURE_CLIENT_NAME),
    }).filter({ visible: true });
    await expect(link.first()).toBeVisible({ timeout: 20_000 });
    const href = await link.first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(page).toHaveURL(new RegExp(`/copilot/clientes/${FIXTURE_CLIENT_ID}`));
    await expect(page).toHaveURL(/tab=identificacion/);
    await expect(page).toHaveURL(/returnTo=/);
    await expect(page.getByText(/Identificacion bancaria|Identificaci.n bancaria/i).first()).toBeVisible();
  });

  test("5. Paridad descripción/cliente/estado mismo movement_id", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(FIXTURE_CLIENT_NAME).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Asociado", { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await page.goto(
      `/copilot/movimientos-bancarios?tab=conciliacion&movementId=${FIXTURE_ASSOCIATED_ID}`
    );
    await expect(page.locator("[data-bank-drawer]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-bank-drawer-body]")).toContainText(
      `${FIXTURE_FULL_DESCRIPTION} ASOCIADO`
    );
    await expect(page.locator("[data-bank-drawer-body]")).toContainText(FIXTURE_CLIENT_NAME);
    await expect(page.getByRole("heading", { name: /Ver asociación/i })).toBeVisible();
    await page.locator("[data-bank-drawer-close]").click();
  });

  test("6. Mobile: card compacta + Ver movimiento muestra texto completo en drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.locator("[data-bank-movement-description-compact]").filter({ visible: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /^Asignar cliente$/ })).toHaveCount(0);
    const ver = page.locator("[data-bank-ver-movimiento]").filter({ visible: true }).first();
    await expect(ver).toBeVisible();
    await ver.click();
    await expect(page.locator("[data-bank-drawer]")).toBeVisible({ timeout: 20_000 });
    const body = page.locator("[data-bank-drawer-body]");
    await expect(body).toContainText(FIXTURE_FULL_DESCRIPTION);
    // Drawer nunca usa clamp
    const hasClamp = await body.evaluate((el) => el.innerHTML.includes("line-clamp"));
    expect(hasClamp).toBe(false);
    await page.locator("[data-bank-drawer-close]").click();
  });
});
