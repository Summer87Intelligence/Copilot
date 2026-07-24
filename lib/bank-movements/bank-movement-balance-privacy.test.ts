import { describe, expect, it } from "vitest";

import {
  sanitizeBankMovementsForInflowReadonly,
  stripBankMovementBalanceMetadata,
} from "@/lib/bank-movements/bank-movement-balance-privacy";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

function buildMovement(metadata: Record<string, unknown> | null): BankMovement {
  return {
    id: "mv-1",
    workspace_id: "ws-1",
    import_id: null,
    bank_name: "Santander",
    account_label: "Santander 000001211749 UYU",
    movement_date: "2026-07-01",
    description: "Transferencia recibida",
    raw_description: null,
    amount: 1000,
    currency: "UYU",
    direction: "inflow",
    bank_reference: "REF-1",
    status: "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
  };
}

describe("stripBankMovementBalanceMetadata", () => {
  it("elimina metadata.balance sin tocar amount/direction ni otras claves", () => {
    const movement = buildMovement({ balance: 531_696.06, debit: null, credit: 1000, parser: "santander_pdf_v1" });
    const sanitized = stripBankMovementBalanceMetadata(movement);

    expect(sanitized.metadata).not.toHaveProperty("balance");
    expect(sanitized.metadata?.debit).toBeNull();
    expect(sanitized.metadata?.credit).toBe(1000);
    expect(sanitized.metadata?.parser).toBe("santander_pdf_v1");
    expect(sanitized.amount).toBe(1000);
    expect(sanitized.direction).toBe("inflow");
  });

  it("no muta el objeto original", () => {
    const original = buildMovement({ balance: 100 });
    const sanitized = stripBankMovementBalanceMetadata(original);
    expect(original.metadata).toHaveProperty("balance");
    expect(sanitized).not.toBe(original);
  });

  it("es no-op si no hay metadata o no hay clave de saldo", () => {
    const noMetadata = buildMovement(null);
    expect(stripBankMovementBalanceMetadata(noMetadata)).toBe(noMetadata);

    const noBalanceKey = buildMovement({ parser: "santander_pdf_v1" });
    expect(stripBankMovementBalanceMetadata(noBalanceKey)).toBe(noBalanceKey);
  });
});

describe("sanitizeBankMovementsForInflowReadonly", () => {
  it("aplica el strip a cada movimiento del array", () => {
    const movements = [buildMovement({ balance: 1 }), buildMovement({ balance: 2 })];
    const sanitized = sanitizeBankMovementsForInflowReadonly(movements);
    expect(sanitized.every((m) => !("balance" in (m.metadata ?? {})))).toBe(true);
    expect(sanitized).toHaveLength(2);
  });
});
