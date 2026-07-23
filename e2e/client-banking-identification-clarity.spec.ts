/**
 * FASE CLIENT-BANKING-IDENTIFICATION-CLARITY-AND-HISTORY-CLEANUP-001
 * E2E con fixtures: 1 activa + 8 revocadas QA + 1 duplicado excluido.
 */
import { expect, test } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";

const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVE_MOVEMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FULL_DESC =
  "CRÉDITO OPERACIÓN EN BANCA DIGITAL 198677 TSUPRASUR S.A./SUPRASUR S.A.";

function associationPayload() {
  const revoked = Array.from({ length: 8 }, (_, i) => ({
    id: `rev-${i}`,
    movementId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}`,
    status: "revoked",
    movementDate: "2026-07-01",
    associatedAt: "2026-07-20T10:00:00Z",
    revokedAt: "2026-07-22T18:00:00Z",
    importedAt: "2026-07-02T00:00:00Z",
    amount: 100 + i,
    currency: "UYU",
    amountLabel: `UYU ${100 + i}`,
    displayDescription: `REVOKED DESC ${i}`,
    bankReference: null,
    confirmedByEmail: "qa@example.com",
    revokedByEmail: "daniel@example.com",
    reason: "bank_simple_reconciliation_reset_20260722",
    isDuplicate: false,
    excludedFromOperations: false,
    isNonCommercial: false,
  }));

  const active = {
    id: "active-1",
    movementId: ACTIVE_MOVEMENT_ID,
    status: "identified",
    movementDate: "2026-07-14",
    associatedAt: "2026-07-23T12:00:00Z",
    revokedAt: null,
    importedAt: "2026-07-15T00:00:00Z",
    amount: 610,
    currency: "USD",
    amountLabel: "USD 610",
    displayDescription: FULL_DESC,
    bankReference: "198677",
    confirmedByEmail: "daniel@example.com",
    revokedByEmail: null,
    reason: null,
    isDuplicate: false,
    excludedFromOperations: false,
    isNonCommercial: false,
  };

  const duplicate = {
    ...active,
    id: "dup-1",
    movementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    isDuplicate: true,
    excludedFromOperations: true,
    amount: 610,
    amountLabel: "USD 610",
    displayDescription: `${FULL_DESC} DUP`,
  };

  return {
    ok: true,
    identities: [],
    history: [],
    identificationsOnly: [active],
    reconciledPayments: [],
    summary: {
      activeCount: 1,
      totalUyu: 0,
      totalUsd: 610,
      firstTransferDate: "2026-07-14",
      lastTransferDate: "2026-07-14",
      currencies: ["USD"],
      confidenceLabel: "Posible",
    },
    howAppears: {
      observedNames: ["TSUPRASUR S.A.", "SUPRASUR S.A."],
      frequentDescription: "CRÉDITO OPERACIÓN EN BANCA DIGITAL",
      maskedAccount: null,
    },
    activeHistory: [active],
    corrections: revoked,
    correctionsGrouped: [
      {
        key: "qa_reset",
        label: "Reset de conciliaciones de prueba — 8 asociaciones revocadas",
        count: 8,
        items: revoked,
      },
    ],
    habitualPayment: {
      bankName: "TSUPRASUR S.A. / SUPRASUR S.A.",
      frequentDescription: "CRÉDITO OPERACIÓN EN BANCA DIGITAL",
      currency: "USD",
      movementCount: 1,
      amountHint: "USD 610",
      firstSeen: "2026-07-14",
      lastSeen: "2026-07-14",
      statusLabel: "Posible",
    },
    _duplicateExcluded: duplicate,
  };
}


function emptyAgingBuckets() {
  return {
    on_time: 0,
    late_1_7: 0,
    late_8_14: 0,
    late_15_30: 0,
    late_30_plus: 0,
  };
}

/** Minimal Client 360 payload so identificacion tab mounts ClientPayerMemorySection. */
function client360Payload() {
  return {
    ok: true,
    payload: {
      summary: {
        company_id: CLIENT_ID,
        razon_social: "TSUPRASUR S.A.",
        nombre_visible: "TSUPRASUR S.A.",
        codigo: "T001",
        rut_documento: null,
        industry: null,
        phone: null,
        commercial: null,
        is_active: true,
      },
      cuenta: {
        saldo_pendiente_total: 0,
        comprobantes_count: 0,
        recibos_count: 0,
        ultimos_movimientos: [],
      },
      invoices: [],
      receipts: [],
      insights: [],
      contacts: [],
      zeta_sync_rows: [],
      zeta_metadata: null,
      debt_uyu: 0,
      debt_usd: 0,
      overdue_uyu: 0,
      overdue_usd: 0,
      last_receipt_date: null,
      last_invoice_date: null,
      last_sync_at: null,
      transfer_method: null,
      transferAliases: [],
      aging: {
        UYU: emptyAgingBuckets(),
        USD: emptyAgingBuckets(),
        lateInvoiceCount: { UYU: 0, USD: 0 },
      },
      overdue_invoice_count: 0,
    },
  };
}

test.describe("Client banking identification clarity", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    await page.route(`**/api/copilot/client-360?**`, async (route) => {
      const url = route.request().url();
      if (!url.includes(CLIENT_ID)) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(client360Payload()),
      });
    });
    await page.route(`**/api/copilot/clients/${CLIENT_ID}/payer-memory**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(associationPayload()),
      });
    });
    await page.route(`**/api/copilot/clients/${CLIENT_ID}/bank-aliases**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, aliases: [] }),
      });
    });
    await page.route(`**/api/copilot/clients/${CLIENT_ID}/billing-concepts**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, concepts: [] }),
      });
    });
    await page.route(`**/copilot/clientes/${CLIENT_ID}**`, async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.continue();
        return;
      }
      // Dejar que Next sirva la app real; solo APIs están mockeadas.
      await route.continue();
    });
  });

  test("desktop: resumen 1 activa, correcciones colapsadas, alias limpio", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/copilot/clientes/${CLIENT_ID}?tab=identificacion`);
    await expect(page.locator("[data-client-banking-summary]")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("[data-client-banking-summary]")).toContainText("1");
    await expect(page.locator("[data-client-banking-summary]")).toContainText("610");
    await expect(page.locator("[data-client-banking-summary]")).toContainText("Posible");

    await expect(page.locator("[data-client-banking-how-appears]")).toContainText("TSUPRASUR");
    await expect(page.locator("[data-client-banking-how-appears]")).toContainText(
      "CRÉDITO OPERACIÓN EN BANCA DIGITAL"
    );
    await expect(page.locator("[data-client-banking-how-appears]")).not.toContainText(
      "operacion en banca digital tsuprasur"
    );

    await expect(page.locator("[data-client-banking-habitual]")).toContainText("Movimientos observados");
    await expect(page.locator("[data-client-banking-habitual]")).toContainText("1");
    await expect(page.locator("[data-client-banking-habitual]")).not.toContainText("revocada");

    const activeRows = page.locator("[data-client-banking-active-history] tbody tr");
    await expect(activeRows).toHaveCount(1);
    await expect(page.locator("[data-client-banking-active-history]")).toContainText("14");
    await expect(page.locator("[data-client-banking-active-history]")).toContainText("USD 610");

    await expect(page.locator("[data-client-banking-corrections-toggle]")).toContainText(
      "Correcciones anteriores (8)"
    );
    await page.locator("[data-client-banking-corrections-toggle]").click();
    await expect(page.getByText(/Reset de conciliaciones de prueba — 8/)).toBeVisible();

    const ver = page.locator(`[data-bank-ver-en-banco="${ACTIVE_MOVEMENT_ID}"]`).first();
    await expect(ver).toHaveAttribute("href", new RegExp(`movementId=${ACTIVE_MOVEMENT_ID}`));
    await expect(ver).toHaveAttribute("href", /tab=movimientos/);
    await expect(ver).toHaveAttribute("href", /view=consult/);
  });

  test("mobile: card activa + Ver en Banco consult", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/copilot/clientes/${CLIENT_ID}?tab=identificacion`);
    await expect(page.locator("[data-client-banking-summary]")).toBeVisible({ timeout: 45_000 });
    await expect(
      page.locator(`[data-client-banking-active-card="${ACTIVE_MOVEMENT_ID}"]`)
    ).toBeVisible();
    await expect(page.locator("[data-client-billing-concepts-empty]")).toBeVisible();
  });
});
