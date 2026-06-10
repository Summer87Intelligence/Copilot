import { describe, expect, it, vi, beforeEach } from "vitest";

import * as manualRepo from "@/lib/treasury/repositories/manual-cash-movement-repository";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import {
  compareManualCashMovementsNewestFirst,
  deleteManualCashMovement,
  isManualCashMovementDeletable,
  sortManualCashMovementsNewestFirst,
  updateManualCashMovement,
} from "@/lib/treasury/treasury-manual-cash-movements";

vi.mock("@/lib/treasury/repositories/manual-cash-movement-repository", () => ({
  manualCashMovementRepositoryGetById: vi.fn(),
  manualCashMovementRepositoryUpdate: vi.fn(),
  manualCashMovementRepositoryDelete: vi.fn(),
}));

function makeMovement(
  partial: Partial<ManualCashMovement> & Pick<ManualCashMovement, "id">
): ManualCashMovement {
  return {
    id: partial.id,
    workspaceId: "ws-1",
    companyId: null,
    accountId: null,
    ledgerType: "cash",
    movementType: "expense",
    source: partial.source ?? "manual",
    concept: partial.concept ?? "Test",
    category: null,
    amount: partial.amount ?? 100,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: partial.movementDate ?? "2026-05-21",
    paymentMethod: null,
    counterparty: null,
    reference: null,
    notes: null,
    affectsCashflow: true,
    reconciled: partial.reconciled ?? false,
    bankReconciliationId: null,
    status: partial.status ?? "active",
    createdBy: null,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
    rawPayload: null,
    metadata: null,
  };
}

describe("compareManualCashMovementsNewestFirst", () => {
  it("ordena por fecha descendente, luego created_at, luego id", () => {
    const sorted = sortManualCashMovementsNewestFirst([
      makeMovement({ id: "a", movementDate: "2026-05-01", createdAt: "2026-05-01T10:00:00Z" }),
      makeMovement({ id: "c", movementDate: "2026-06-10", createdAt: "2026-06-10T08:00:00Z" }),
      makeMovement({ id: "b", movementDate: "2026-06-10", createdAt: "2026-06-10T12:00:00Z" }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["b", "c", "a"]);
    expect(
      compareManualCashMovementsNewestFirst(
        makeMovement({ id: "z", movementDate: "2026-06-01", createdAt: "2026-06-01T00:00:00Z" }),
        makeMovement({ id: "y", movementDate: "2026-06-01", createdAt: "2026-06-01T00:00:00Z" })
      )
    ).toBeLessThan(0);
  });
});

describe("isManualCashMovementDeletable", () => {
  it("solo source manual es editable/eliminable", () => {
    expect(isManualCashMovementDeletable(makeMovement({ id: "1", source: "manual" }))).toBe(
      true
    );
    expect(isManualCashMovementDeletable(makeMovement({ id: "2", source: "santander" }))).toBe(
      false
    );
  });
});

describe("updateManualCashMovement", () => {
  const supabase = {} as never;
  const tenantId = "ws-tenant";

  beforeEach(() => {
    vi.mocked(manualRepo.manualCashMovementRepositoryGetById).mockReset();
    vi.mocked(manualRepo.manualCashMovementRepositoryUpdate).mockReset();
  });

  it("actualiza movimiento manual del workspace", async () => {
    const row = makeMovement({ id: "m1", concept: "Actualizado", amount: 200 });
    vi.mocked(manualRepo.manualCashMovementRepositoryGetById).mockResolvedValue({
      row: makeMovement({ id: "m1" }),
      error: null,
    });
    vi.mocked(manualRepo.manualCashMovementRepositoryUpdate).mockResolvedValue({
      row,
      error: null,
    });

    const result = await updateManualCashMovement(supabase, tenantId, "m1", {
      concept: "Actualizado",
      amount: 200,
    });
    expect(result.ok).toBe(true);
    expect(manualRepo.manualCashMovementRepositoryUpdate).toHaveBeenCalled();
  });

  it("rechaza concepto vacío vía validación del servicio", async () => {
    vi.mocked(manualRepo.manualCashMovementRepositoryGetById).mockResolvedValue({
      row: makeMovement({ id: "m1" }),
      error: null,
    });

    const result = await updateManualCashMovement(supabase, tenantId, "m1", {
      concept: "   ",
    });
    expect(result.ok).toBe(false);
  });

  it("no edita movimiento importado (source distinto de manual)", async () => {
    vi.mocked(manualRepo.manualCashMovementRepositoryGetById).mockResolvedValue({
      row: makeMovement({ id: "m1", source: "bank" }),
      error: null,
    });

    const result = await updateManualCashMovement(supabase, tenantId, "m1", { concept: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(manualRepo.manualCashMovementRepositoryUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteManualCashMovement", () => {
  const supabase = {} as never;
  const tenantId = "ws-tenant";

  beforeEach(() => {
    vi.mocked(manualRepo.manualCashMovementRepositoryGetById).mockReset();
    vi.mocked(manualRepo.manualCashMovementRepositoryDelete).mockReset();
  });

  it("elimina por id + workspace", async () => {
    vi.mocked(manualRepo.manualCashMovementRepositoryGetById).mockResolvedValue({
      row: makeMovement({ id: "m1" }),
      error: null,
    });
    vi.mocked(manualRepo.manualCashMovementRepositoryDelete).mockResolvedValue({
      deleted: true,
      error: null,
    });

    const result = await deleteManualCashMovement(supabase, tenantId, "m1");
    expect(result.ok).toBe(true);
    expect(manualRepo.manualCashMovementRepositoryDelete).toHaveBeenCalledWith(
      supabase,
      tenantId,
      "m1"
    );
  });

  it("no elimina si source no es manual", async () => {
    vi.mocked(manualRepo.manualCashMovementRepositoryGetById).mockResolvedValue({
      row: makeMovement({ id: "m1", source: "santander" }),
      error: null,
    });

    const result = await deleteManualCashMovement(supabase, tenantId, "m1");
    expect(result.ok).toBe(false);
    expect(manualRepo.manualCashMovementRepositoryDelete).not.toHaveBeenCalled();
  });

  it("falla si id vacío", async () => {
    const result = await deleteManualCashMovement(supabase, tenantId, "  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });
});
