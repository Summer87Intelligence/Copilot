/**
 * FASE BANK-FILTERS-KPI-AND-HISTORY-USABILITY-001
 * Playwright con fixtures — sin escrituras a producción.
 */
import { expect, test, type Page } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";
import {
  CLIENT_SUPRASUR_ID,
  CLIENT_SUPRASUR_NAME,
  createFiltersKpiFixtureState,
  filtersKpiAssociationPayload,
  filtersKpiHistoryIdentifications,
  filtersKpiListPayload,
  ID_PENDING_JUL,
  JULY_KPI,
  type FiltersKpiFixtureState,
} from "./fixtures/bank-filters-kpi";

test.describe.configure({ timeout: 120_000 });

async function installFixtures(page: Page, state: FiltersKpiFixtureState) {
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

  await page.route("**/api/copilot/bank-movements/canonical-suggestions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  await page.route("**/api/copilot/bank-reconciliation/clients-search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [{ id: CLIENT_SUPRASUR_ID, name: CLIENT_SUPRASUR_NAME }],
      }),
    });
  });

  await page.route("**/api/copilot/bank-reconciliation/client-identifications**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes("/recent")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filtersKpiHistoryIdentifications()),
      });
      return;
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { movementIds?: string[]; clientCompanyId?: string };
      const mid = body.movementIds?.[0];
      if (mid && body.clientCompanyId) {
        state.levels[mid] = "client_identified";
        state.statuses[mid] = "matched";
        state.clients[mid] = {
          clientCompanyId: body.clientCompanyId,
          clientName: CLIENT_SUPRASUR_NAME,
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { createdCount: 1 } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  await page.route("**/api/copilot/bank-reconciliation/movements/*/association**", async (route) => {
    const match = route.request().url().match(/movements\/([0-9a-f-]{36})\/association/i);
    const id = match?.[1] ?? ID_PENDING_JUL;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(filtersKpiAssociationPayload(id, state)),
    });
  });

  await page.route("**/api/copilot/bank-movements**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";

    if (pathname.endsWith("/imports") || pathname.includes("/imports/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [] }),
      });
      return;
    }

    if (pathname.includes("/reconciliation") || pathname.includes("canonical-suggestions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: pathname.includes("reconciliation") ? { items: [] } : [],
        }),
      });
      return;
    }

    if (method === "PATCH" && /\/bank-movements\/[0-9a-f-]{36}$/i.test(pathname)) {
      const idMatch = pathname.match(/([0-9a-f-]{36})$/i);
      const id = idMatch?.[1];
      const body = route.request().postDataJSON() as { status?: string };
      if (id && body.status) {
        state.statuses[id] = body.status;
        if (body.status === "needs_review") {
          state.levels[id] = "unidentified";
          delete state.clients[id];
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      });
      return;
    }

    if (method !== "GET") {
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
        body: JSON.stringify({ ok: true, data: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(filtersKpiListPayload(state)),
    });
  });
}

async function openBank(page: Page, query = "tab=movimientos&month=2026-07") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/copilot/movimientos-bancarios?${query}`);
  await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
    timeout: 45_000,
  });
}

function kpiValue(page: Page, focus: "pending" | "inflow" | "outflow" | "reviewed") {
  return page.getByTestId(`bank-kpi-${focus}`).locator("p").nth(1);
}

test.describe("Bank filters + KPI + history — fixtures", () => {
  let state: FiltersKpiFixtureState;

  test.beforeEach(async ({ context, page, baseURL }) => {
    state = createFiltersKpiFixtureState();
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    await installFixtures(page, state);
  });

  test("1. Julio 2026 — KPI canónicos y subtítulo de período", async ({ page }) => {
    await openBank(page, "tab=movimientos&month=2026-07");
    await expect(page.getByTestId("bank-simple-filters")).toBeVisible({ timeout: 20_000 });
    await expect(kpiValue(page, "pending")).toHaveText(String(JULY_KPI.pending), { timeout: 20_000 });
    await expect(kpiValue(page, "inflow")).toHaveText(String(JULY_KPI.inflow));
    await expect(kpiValue(page, "outflow")).toHaveText(String(JULY_KPI.outflow));
    await expect(kpiValue(page, "reviewed")).toHaveText(String(JULY_KPI.reviewed));
    await expect(page.getByText(/Julio 2026/i).first()).toBeVisible();
  });

  test("2. Movimientos — filtros avanzados cerrados; chips; limpiar; paginar", async ({ page }) => {
    await openBank(page, "tab=movimientos&month=2026-07");
    await expect(page.getByTestId("bank-more-filters-panel")).toBeHidden();
    await page.getByTestId("bank-more-filters").click();
    await expect(page.getByTestId("bank-more-filters-panel")).toBeVisible();
    await page.locator("#bank-adv-currency").selectOption("USD");
    await page.locator("#bank-adv-direction").selectOption("inflow");
    await expect(page.getByTestId("bank-filter-chips")).toBeVisible();
    await expect(page.getByTestId("bank-filter-chips")).toContainText("USD");
    await page.getByTestId("bank-clear-filters").filter({ visible: true }).click();
    await expect(page.getByTestId("bank-filter-chips")).toHaveCount(0);
    await expect(page.getByTestId("bank-simple-filters")).toBeVisible();
  });

  test("3. Búsqueda por referencia y URL persistente", async ({ page }) => {
    await openBank(page, "tab=movimientos&month=2026-07");
    await page.getByTestId("bank-search-input").fill("198677");
    await expect(page).toHaveURL(/q=198677/, { timeout: 10_000 });
    await expect(page.getByText("198677").filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByTestId("bank-search-input")).toHaveValue("198677", { timeout: 20_000 });
    await expect(page.getByText("198677").filter({ visible: true }).first()).toBeVisible();
  });

  test("4. Conciliación — asociar actualiza KPI pendientes/revisados", async ({ page }) => {
    await openBank(page, "tab=conciliacion&month=2026-07");
    await expect(page.getByTestId("bank-conciliation-list")).toBeVisible({ timeout: 20_000 });
    await expect(kpiValue(page, "pending")).toHaveText(String(JULY_KPI.pending));
    await expect(kpiValue(page, "reviewed")).toHaveText(String(JULY_KPI.reviewed));

    await page.getByRole("button", { name: /^Asignar cliente$/ }).first().click();
    await expect(page.locator("[data-bank-drawer]")).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder("Buscar cliente…").fill("Suprasur");
    await expect(page.getByRole("button", { name: CLIENT_SUPRASUR_NAME })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: CLIENT_SUPRASUR_NAME }).click();
    await page.getByRole("button", { name: /Confirmar asociación/i }).click();
    await expect(kpiValue(page, "pending")).toHaveText(String(JULY_KPI.pending - 1), { timeout: 20_000 });
    await expect(kpiValue(page, "reviewed")).toHaveText(String(JULY_KPI.reviewed + 1));
  });

  test("5. Historial — buscar Suprasur y filtrar julio", async ({ page }) => {
    await openBank(page, "tab=historial&month=2026-07");
    await expect(page.getByTestId("bank-history-panel")).toBeVisible({ timeout: 20_000 });
    const clientRow = page.getByTestId("bank-history-panel").getByRole("button", { name: /Suprasur/i }).first();
    await expect(clientRow).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("bank-search-input").fill("Suprasur");
    await expect(clientRow).toBeVisible({ timeout: 10_000 });
    await clientRow.click();
    await expect(page.getByTestId("bank-history-panel").getByText(/USD 610/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("bank-search-input").fill("");
    await expect(page.getByTestId("bank-history-panel")).toBeVisible();
  });

  test("6. KPI click Pendientes aplica filtro; Restablecer vista", async ({ page }) => {
    await openBank(page, "tab=movimientos&month=2026-07");
    await page.getByTestId("bank-kpi-pending").click();
    await expect(page.getByTestId("bank-kpi-pending")).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/kpi=pending/);
    await page.getByRole("button", { name: /Restablecer vista/i }).click();
    await expect(page.getByTestId("bank-kpi-pending")).toHaveAttribute("aria-pressed", "false");
  });

  test("7. Mobile — filtros compactos con contador", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos&month=2026-07");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole("button", { name: /Filtros \(/i })).toBeVisible();
    await page.getByRole("button", { name: /Filtros \(/i }).click();
    await expect(page.locator("#bank-period-select-mobile")).toBeVisible();
  });
});
