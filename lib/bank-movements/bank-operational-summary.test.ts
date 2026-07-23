import { describe, expect, it } from "vitest";

import { getBankOperationalSummary, isBankMovementReviewed } from "@/lib/bank-movements/bank-operational-summary";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

function movement(
  partial: Partial<BankMovement> & Pick<BankMovement, "id" | "amount" | "description">
): BankMovement {
  return {
    workspace_id: "ws",
    import_id: null,
    bank_name: "Santander",
    account_label: "UYU",
    movement_date: partial.movement_date ?? "2026-07-10",
    raw_description: null,
    currency: partial.currency ?? "UYU",
    direction: partial.direction ?? "inflow",
    bank_reference: null,
    status: partial.status ?? "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: partial.metadata ?? null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...partial,
  };
}

describe("bank-operational-summary", () => {
  const from = "2026-07-01";
  const to = "2026-07-31";

  it("excluye duplicados, ocultos e históricos del universo KPI", () => {
    const rows = [
      movement({ id: "ok", description: "OK", amount: 100, movement_date: "2026-07-05" }),
      movement({
        id: "dup",
        description: "DUP",
        amount: 50,
        movement_date: "2026-07-06",
      }),
      movement({
        id: "hidden",
        description: "HID",
        amount: 20,
        movement_date: "2026-07-06",
        metadata: { ui_hidden: true },
      }),
      movement({
        id: "old",
        description: "OLD",
        amount: 10,
        movement_date: "2025-01-01",
      }),
    ];

    const summary = getBankOperationalSummary({
      movements: rows,
      from,
      to,
      duplicates: { dup: { canonicalMovementId: "ok" } },
    });

    expect(summary.totalOperationalCount).toBe(1);
    expect(summary.inflowCount).toBe(1);
  });

  it("cuenta pendientes de identificar (sin_cliente) y revisados", () => {
    const rows = [
      movement({ id: "sin", description: "SIN", amount: 100, status: "pending" }),
      movement({ id: "rev", description: "REV", amount: 200, status: "ignored" }),
      movement({ id: "asoc", description: "ASOC", amount: 300, status: "pending" }),
    ];

    const summary = getBankOperationalSummary({
      movements: rows,
      from,
      to,
      levels: { asoc: "client_identified" },
    });

    expect(summary.pendingIdentificationCount).toBe(1);
    expect(summary.reviewedCount).toBe(2);
  });

  it("isBankMovementReviewed incluye matched, ignored, needs_review y asociado", () => {
    expect(isBankMovementReviewed(movement({ id: "m1", description: "M", amount: 1, status: "matched" }))).toBe(true);
    expect(isBankMovementReviewed(movement({ id: "m2", description: "M", amount: 1, status: "ignored" }))).toBe(true);
    expect(isBankMovementReviewed(movement({ id: "m3", description: "M", amount: 1, status: "needs_review" }))).toBe(
      true
    );
    expect(
      isBankMovementReviewed(movement({ id: "m4", description: "M", amount: 1, status: "pending" }), {
        m4: "client_identified",
      })
    ).toBe(true);
    expect(isBankMovementReviewed(movement({ id: "m5", description: "M", amount: 1, status: "pending" }))).toBe(false);
  });

  it("respeta filtro direction y currency en KPI", () => {
    const rows = [
      movement({ id: "uyu-in", description: "A", amount: 100, direction: "inflow", currency: "UYU" }),
      movement({ id: "usd-in", description: "B", amount: 50, direction: "inflow", currency: "USD" }),
      movement({ id: "uyu-out", description: "C", amount: 30, direction: "outflow", currency: "UYU" }),
    ];

    const inflowUyu = getBankOperationalSummary({
      movements: rows,
      from,
      to,
      direction: "inflow",
      currency: "UYU",
    });

    expect(inflowUyu.totalOperationalCount).toBe(1);
    expect(inflowUyu.inflowAmountByCurrency.UYU).toBe(100);
  });
});
