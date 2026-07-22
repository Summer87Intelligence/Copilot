import { describe, expect, it } from "vitest";

import {
  buildHideMetadata,
  buildRestoreMetadata,
  isBankMovementUiHidden,
} from "@/lib/bank-movements/bank-movement-visibility";
import {
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  filterBankMovements,
} from "@/lib/bank-movements/bank-movements-filters";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import { deriveCaseStatus, unifiedCaseStatusLabel } from "@/lib/bank/canonical/unified-reconciliation-status";
import { sortRows } from "@/lib/ui/table-sort-model";

function movement(partial: Partial<BankMovement> & Pick<BankMovement, "description" | "amount">): BankMovement {
  return {
    id: partial.id ?? "m1",
    workspace_id: "ws",
    import_id: null,
    bank_name: "Santander",
    account_label: partial.account_label ?? "Santander UYU",
    movement_date: partial.movement_date ?? "2026-07-06",
    description: partial.description,
    raw_description: partial.raw_description ?? null,
    amount: partial.amount,
    currency: partial.currency ?? "UYU",
    direction: partial.direction ?? "inflow",
    bank_reference: partial.bank_reference ?? null,
    status: partial.status ?? "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: partial.metadata ?? null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

describe("bank movement UI visibility metadata", () => {
  it("hide is idempotent and restore clears ui_hidden", () => {
    const first = buildHideMetadata({}, { actorId: "u1", reason: "ruido" });
    expect(isBankMovementUiHidden(first)).toBe(true);
    const second = buildHideMetadata(first, { actorId: "u2", reason: "otra" });
    expect(isBankMovementUiHidden(second)).toBe(true);
    expect(second.hidden_by).toBe("u2");

    const restored = buildRestoreMetadata(second, { actorId: "u3" });
    expect(isBankMovementUiHidden(restored)).toBe(false);
    expect(restored.restored_by).toBe("u3");
    expect(restored.hidden_at).toBeTruthy();
  });

  it("default filter excludes hidden; Ocultos/Todos respect visibility", () => {
    const visible = movement({ id: "v", description: "OK", amount: 10 });
    const hidden = movement({
      id: "h",
      description: "HIDDEN",
      amount: 20,
      metadata: buildHideMetadata({}, { actorId: "u1" }),
    });
    const rows = [visible, hidden];
    const now = new Date("2026-07-09T12:00:00");

    expect(
      filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, visibility: "visible" }, now).map((m) => m.id)
    ).toEqual(["v"]);
    expect(
      filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, visibility: "hidden" }, now).map((m) => m.id)
    ).toEqual(["h"]);
    expect(
      filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, visibility: "all" }, now).map((m) => m.id).sort()
    ).toEqual(["h", "v"]);
  });

  it("amount sort still works with visibility filters", () => {
    const now = new Date("2026-07-09T12:00:00");
    const rows = [
      movement({ id: "a", description: "A", amount: 100, metadata: buildHideMetadata({}, { actorId: "u1" }) }),
      movement({ id: "b", description: "B", amount: 500 }),
      movement({ id: "c", description: "C", amount: 50 }),
    ];
    const visible = filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, visibility: "visible" }, now);
    const desc = sortRows(visible, (m) => Number(m.amount), "desc");
    const asc = sortRows(visible, (m) => Number(m.amount), "asc");
    expect(desc.map((m) => m.id)).toEqual(["b", "c"]);
    expect(asc.map((m) => m.id)).toEqual(["c", "b"]);
  });
});

describe("unified case status labels (Nirmex contract)", () => {
  it("mixed ready/missing never says Listo para confirmar as aggregate badge", () => {
    const status = deriveCaseStatus(
      [...Array(5).fill("listo_para_confirmar"), ...Array(8).fill("falta_recibo")] as never,
      "strong"
    );
    expect(status).toBe("revision_parcial");
    const label = unifiedCaseStatusLabel(status, { ready: 5, missing: 8 });
    expect(label).toBe("5 listos · 8 pendientes de recibo");
    expect(label).not.toMatch(/^Listo para confirmar$/);
    expect(label).not.toBe("Todos listos para confirmar");
  });

  it("all ready / all missing / ambiguous labels", () => {
    expect(unifiedCaseStatusLabel("listo_para_confirmar")).toBe("Todos listos para confirmar");
    expect(unifiedCaseStatusLabel("falta_recibo")).toBe("Falta recibo en Zeta");
    expect(unifiedCaseStatusLabel("requiere_revision")).toBe("Requiere revisión");
  });
});
