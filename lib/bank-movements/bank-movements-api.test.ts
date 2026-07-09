import { describe, expect, it } from "vitest";

import {
  bankMovementCreateBodySchema,
  bankMovementUpdateBodySchema,
  buildBankMovementInsert,
  buildBankMovementPatch,
} from "@/lib/bank-movements/bank-movements-api";

const WS = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

describe("bankMovementCreateBodySchema", () => {
  it("acepta un movimiento manual válido", () => {
    const r = bankMovementCreateBodySchema.safeParse({
      movement_date: "2026-07-09",
      description: "Transferencia recibida",
      amount: 1500.5,
      currency: "UYU",
      direction: "inflow",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza workspace_id enviado por el cliente", () => {
    const r = bankMovementCreateBodySchema.safeParse({
      workspace_id: WS,
      movement_date: "2026-07-09",
      description: "x",
      amount: 10,
      currency: "UYU",
      direction: "inflow",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza monto <= 0", () => {
    const r = bankMovementCreateBodySchema.safeParse({
      movement_date: "2026-07-09",
      description: "x",
      amount: 0,
      currency: "UYU",
      direction: "inflow",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza dirección inválida", () => {
    const r = bankMovementCreateBodySchema.safeParse({
      movement_date: "2026-07-09",
      description: "x",
      amount: 10,
      currency: "UYU",
      direction: "credit",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza fecha mal formada", () => {
    const r = bankMovementCreateBodySchema.safeParse({
      movement_date: "09/07/2026",
      description: "x",
      amount: 10,
      currency: "UYU",
      direction: "inflow",
    });
    expect(r.success).toBe(false);
  });
});

describe("buildBankMovementInsert", () => {
  it("impone workspace_id del servidor y default bank/status", () => {
    const row = buildBankMovementInsert(
      {
        movement_date: "2026-07-09",
        description: "  pago proveedor  ",
        amount: 200,
        currency: "USD",
        direction: "outflow",
      },
      WS
    );
    expect(row.workspace_id).toBe(WS);
    expect(row.bank_name).toBe("Santander");
    expect(row.status).toBe("pending");
    expect(row.description).toBe("pago proveedor");
    expect(row.metadata).toEqual({});
  });
});

describe("buildBankMovementPatch", () => {
  it("al conciliar sella matched_at/matched_by", () => {
    const patch = buildBankMovementPatch({ status: "matched" }, { userId: USER });
    expect(patch.status).toBe("matched");
    expect(patch.matched_by).toBe(USER);
    expect(typeof patch.matched_at).toBe("string");
  });

  it("al salir de matched limpia la auditoría", () => {
    const patch = buildBankMovementPatch({ status: "ignored" }, { userId: USER });
    expect(patch.status).toBe("ignored");
    expect(patch.matched_at).toBeNull();
    expect(patch.matched_by).toBeNull();
  });

  it("solo copia campos provistos", () => {
    const patch = buildBankMovementPatch({ description: " nueva " }, { userId: USER });
    expect(patch.description).toBe("nueva");
    expect("amount" in patch).toBe(false);
    expect("status" in patch).toBe(false);
  });
});

describe("bankMovementUpdateBodySchema", () => {
  it("rechaza update vacío", () => {
    expect(bankMovementUpdateBodySchema.safeParse({}).success).toBe(false);
  });
  it("acepta cambio de estado solo", () => {
    expect(bankMovementUpdateBodySchema.safeParse({ status: "needs_review" }).success).toBe(true);
  });
});
