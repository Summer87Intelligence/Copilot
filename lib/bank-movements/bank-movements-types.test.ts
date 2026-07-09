import { describe, expect, it } from "vitest";

import {
  BANK_IMPORT_STATUSES,
  BANK_IMPORT_STATUS_LABELS,
  BANK_MATCH_SUGGESTION_STATUSES,
  BANK_MOVEMENT_DIRECTIONS,
  BANK_MOVEMENT_DIRECTION_LABELS,
  BANK_MOVEMENT_MATCH_TYPES,
  BANK_MOVEMENT_STATUSES,
  BANK_MOVEMENT_STATUS_LABELS,
  isValidBankMovementDirection,
  isValidBankMovementStatus,
} from "@/lib/bank-movements/bank-movements-types";

describe("bank movements types", () => {
  it("estados de movimiento esperados", () => {
    expect([...BANK_MOVEMENT_STATUSES]).toEqual([
      "pending",
      "suggested",
      "matched",
      "ignored",
      "needs_review",
    ]);
  });

  it("direcciones esperadas", () => {
    expect([...BANK_MOVEMENT_DIRECTIONS]).toEqual(["inflow", "outflow"]);
  });

  it("estados de import esperados", () => {
    expect([...BANK_IMPORT_STATUSES]).toEqual(["uploaded", "parsed", "failed", "archived"]);
  });

  it("tipos de match esperados", () => {
    expect([...BANK_MOVEMENT_MATCH_TYPES]).toEqual([
      "zeta_receipt",
      "manual_movement",
      "planned_payment",
      "client",
      "internal",
      "other",
    ]);
  });

  it("estados de sugerencia esperados", () => {
    expect([...BANK_MATCH_SUGGESTION_STATUSES]).toEqual([
      "open",
      "accepted",
      "rejected",
      "expired",
    ]);
  });

  it("labels cubren todos los estados", () => {
    for (const status of BANK_MOVEMENT_STATUSES) {
      expect(BANK_MOVEMENT_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const direction of BANK_MOVEMENT_DIRECTIONS) {
      expect(BANK_MOVEMENT_DIRECTION_LABELS[direction]).toBeTruthy();
    }
    for (const status of BANK_IMPORT_STATUSES) {
      expect(BANK_IMPORT_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("validadores aceptan valores válidos y rechazan inválidos", () => {
    expect(isValidBankMovementStatus("matched")).toBe(true);
    expect(isValidBankMovementStatus("unknown")).toBe(false);
    expect(isValidBankMovementDirection("inflow")).toBe(true);
    expect(isValidBankMovementDirection("credit")).toBe(false);
  });
});
