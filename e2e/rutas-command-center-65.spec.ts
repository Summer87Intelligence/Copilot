import { expect, test, type Locator, type Page } from "@playwright/test";

import { ensureCopilotSession } from "./copilot-session";
import { createNetworkMonitor } from "./network-monitor";
import { waitForOperationalRuntime } from "./rutas-operational-runtime";
import { createSevereCollector } from "./severity-console";

const FILTER_STORAGE_KEY = "copilot:ui:rutas:command-center-filter";
const FILTER_LABELS = [
  "Todos",
  "Críticos",
  "Bloqueados",
  "Vencidos",
  "Míos",
  "Sin dueño",
  "Recurrentes",
] as const;

async function gotoRutas(page: Page, baseURL: string): Promise<void> {
  const runtimeReady = waitForOperationalRuntime(page, baseURL);
  await page.goto("/copilot/rutas");
  await runtimeReady;
  await expect(page).toHaveURL(/\/copilot\/rutas/);
  await expect(page.getByRole("heading", { level: 1, name: "Qué hacer hoy" })).toBeVisible();
}

function commandCenter(page: Page): Locator {
  return page.getByTestId("rutas-command-center");
}

async function focusCommandCenter(page: Page): Promise<void> {
  const section = commandCenter(page);
  await section.scrollIntoViewIfNeeded();
  await section.focus();
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}

async function waitForCommandCenterReady(page: Page): Promise<void> {
  const section = commandCenter(page);
  await expect(section.getByRole("heading", { name: "Comando operativo" })).toBeVisible();
  await expect(section.getByText("Preparando comando operativo…")).toHaveCount(0, {
    timeout: 90_000,
  });
}

test.describe("FASE 6.5 — Comando operativo en /copilot/rutas", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureCopilotSession(page, baseURL ?? "http://127.0.0.1:3000");
  });

  test("render, filtros, persistencia, panel, atajos y consola", async ({ page, baseURL }) => {
    const severe = createSevereCollector();
    const network = createNetworkMonitor();
    severe.attach(page);
    network.attach(page);

    await gotoRutas(page, baseURL ?? "http://127.0.0.1:3000");
    await waitForCommandCenterReady(page);

    const section = commandCenter(page);
    await expect(section.getByRole("heading", { name: "Comando operativo" })).toBeVisible();

    for (const label of FILTER_LABELS) {
      await section.getByRole("button", { name: label, exact: true }).click();
      await expect(section.getByRole("button", { name: label, exact: true })).toHaveClass(/bg-white/);
    }

    await section.getByRole("button", { name: "Críticos", exact: true }).click();
    await expect
      .poll(async () => page.evaluate((key) => window.localStorage.getItem(key), FILTER_STORAGE_KEY))
      .toBe("critical");

    await page.reload();
    await waitForCommandCenterReady(page);
    await expect(section.getByRole("button", { name: "Críticos", exact: true })).toHaveClass(/bg-white/);

    const rows = section.locator("ul button");
    const rowCount = await rows.count();
    if (rowCount > 0) {
      await rows.first().click();
      await expect(section.getByText("Estado:")).toBeVisible();

      await focusCommandCenter(page);
      if (rowCount > 1) {
        await page.keyboard.press("j");
        await expect(rows.nth(1)).toHaveClass(/border-\[var\(--copilot-ink\)\]/);
        await page.keyboard.press("k");
        await expect(rows.first()).toHaveClass(/border-\[var\(--copilot-ink\)\]/);
      }

      await page.keyboard.press("Escape");
      await expect(section.getByText("Seleccioná un ítem para ver contexto y acciones rápidas.")).toBeVisible();

      await page.keyboard.press("Enter");
      await expect(section.getByText("Estado:")).toBeVisible();
    }

    await expect(page.locator("body")).not.toContainText("Hydration failed");
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");

    severe.assertClean();
    network.assertNoServerErrors();
  });

  test("quick actions sin reload completo ni duplicados", async ({ page, baseURL }) => {
    const severe = createSevereCollector();
    const network = createNetworkMonitor();
    severe.attach(page);
    network.attach(page);

    await gotoRutas(page, baseURL ?? "http://127.0.0.1:3000");
    await waitForCommandCenterReady(page);

    const section = commandCenter(page);
    const rows = section.locator("ul button");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "Sin ítems en la cola para validar acciones rápidas.");

    await rows.first().click();
    await expect(section.getByText("Estado:")).toBeVisible();

    const timelineBefore = await section.locator("li").filter({ hasText: /·/ }).count();
    const rowIdsBefore = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? "")
    );

    const assignMe = section.getByRole("button", { name: "Asignarme", exact: true });
    if (await assignMe.isVisible()) {
      const navigation = page.waitForEvent("framenavigated", { timeout: 2_000 }).catch(() => null);
      await assignMe.click();
      await expect(assignMe).toBeEnabled({ timeout: 20_000 });
      expect(await navigation).toBeNull();
    }

    const completeStep = section.getByRole("button", { name: "Completar paso", exact: true });
    if (await completeStep.isVisible()) {
      const navigation = page.waitForEvent("framenavigated", { timeout: 2_000 }).catch(() => null);
      await completeStep.click();
      await expect(completeStep).toBeEnabled({ timeout: 20_000 });
      expect(await navigation).toBeNull();
    }

    const block = section.getByRole("button", { name: "Bloquear", exact: true });
    const unblock = section.getByRole("button", { name: "Desbloquear", exact: true });
    if (await block.isVisible()) {
      const navigation = page.waitForEvent("framenavigated", { timeout: 2_000 }).catch(() => null);
      await block.click();
      await expect(block.or(unblock)).toBeEnabled({ timeout: 20_000 });
      expect(await navigation).toBeNull();
    } else if (await unblock.isVisible()) {
      const navigation = page.waitForEvent("framenavigated", { timeout: 2_000 }).catch(() => null);
      await unblock.click();
      await expect(block.or(unblock)).toBeEnabled({ timeout: 20_000 });
      expect(await navigation).toBeNull();
    }

    const cancel = section.getByRole("button", { name: "Cancelar", exact: true });
    if (await cancel.isVisible()) {
      const navigation = page.waitForEvent("framenavigated", { timeout: 2_000 }).catch(() => null);
      await cancel.click();
      await expect(cancel).toBeEnabled({ timeout: 20_000 });
      expect(await navigation).toBeNull();
    }

    const resolve = section.getByRole("button", { name: "Resolver", exact: true });
    if (await resolve.isVisible()) {
      const navigation = page.waitForEvent("framenavigated", { timeout: 2_000 }).catch(() => null);
      await resolve.click();
      await expect(resolve).toBeEnabled({ timeout: 20_000 });
      expect(await navigation).toBeNull();
    }

    await waitForCommandCenterReady(page);
    const rowIdsAfter = await section.locator("ul button").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? "")
    );
    const uniqueAfter = new Set(rowIdsAfter);
    expect(uniqueAfter.size).toBe(rowIdsAfter.length);

    const timelineAfter = await section.locator("li").filter({ hasText: /·/ }).count();
    if (timelineBefore > 0 || timelineAfter > 0) {
      expect(timelineAfter).toBeGreaterThanOrEqual(timelineBefore);
    }

    severe.assertClean();
    network.assertNoServerErrors();
  });

  test("responsive 1366×768 sin overflow horizontal", async ({ page, baseURL }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoRutas(page, baseURL ?? "http://127.0.0.1:3000");
    await waitForCommandCenterReady(page);

    await assertNoHorizontalOverflow(page);

    const expand = page.getByRole("button", { name: "Expandir menú lateral" });
    if (await expand.isVisible()) {
      await expand.click();
    }
    await assertNoHorizontalOverflow(page);

    const collapse = page.getByRole("button", { name: "Colapsar menú lateral" });
    if (await collapse.isVisible()) {
      await collapse.click();
    }
    await assertNoHorizontalOverflow(page);

    severe.assertClean();
  });
});
