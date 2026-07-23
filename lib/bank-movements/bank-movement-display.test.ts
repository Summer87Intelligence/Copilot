import { describe, expect, it } from "vitest";

import {
  assertBankMovementParityEqual,
  buildBankMovementListParityView,
  getBankMovementAuditDisplayDescription,
  getBankMovementDisplayDescription,
  stripBankPageMarkers,
} from "@/lib/bank-movements/bank-movement-display";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

function movement(partial: Partial<BankMovement> & Pick<BankMovement, "id">): BankMovement {
  return {
    workspace_id: "ws",
    import_id: null,
    bank_name: "Santander",
    account_label: "Santander 000001211749 UYU",
    movement_date: "2026-07-15",
    description: "DESC FALLBACK",
    raw_description: null,
    amount: 100,
    currency: "UYU",
    direction: "inflow",
    bank_reference: "REF1",
    status: "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: null,
    created_at: "2026-07-15T00:00:00Z",
    updated_at: "2026-07-15T00:00:00Z",
    ...partial,
  };
}

describe("getBankMovementDisplayDescription", () => {
  it("prioriza raw_description sobre description", () => {
    expect(
      getBankMovementDisplayDescription({
        raw_description: "TRANSFERENCIA RECIBIDA 4453956LR-2607150 50885600 ALKITODO SRL",
        description: "corto",
        normalized_description: "alkitodo",
      })
    ).toBe("TRANSFERENCIA RECIBIDA 4453956LR-2607150 50885600 ALKITODO SRL");
  });

  it("usa description si no hay raw", () => {
    expect(
      getBankMovementDisplayDescription({
        raw_description: null,
        description: "Pago ACME SA",
      })
    ).toBe("Pago ACME SA");
  });

  it("quita marcadores de página sin alterar el pagador", () => {
    expect(
      stripBankPageMarkers("PROMOCIONES TARJETAS DE DEBITO DESC FACAL -- 7 of 7 --")
    ).toBe("PROMOCIONES TARJETAS DE DEBITO DESC FACAL");
  });

  it("nunca devuelve vacío", () => {
    expect(getBankMovementDisplayDescription({ description: "   " })).toBe("Sin descripción");
  });

  it("no usa normalized como primario si hay raw", () => {
    const raw = "TRANSF ACME SA";
    expect(
      getBankMovementDisplayDescription({
        raw_description: raw,
        normalized_description: "transf acme sa",
      })
    ).toBe(raw);
  });
});

describe("getBankMovementAuditDisplayDescription", () => {
  it("conserva el texto Santander útil y enmascara solo cuentas largas", () => {
    const raw = "TRANSFERENCIA RECIBIDA 4453956LR-2607150 508856001234 ALKITODO SRL";
    const audit = getBankMovementAuditDisplayDescription({
      raw_description: raw,
      description: "corto",
    });
    expect(audit).toContain("TRANSFERENCIA RECIBIDA");
    expect(audit).toContain("ALKITODO SRL");
    expect(audit).not.toContain("508856001234");
    expect(audit).toMatch(/•+1234/);
  });

  it("coincide con la descripción visible cuando no hay dígitos sensibles", () => {
    const src = { raw_description: "TRANSFERENCIA RECIBIDA ALKITODO SRL" };
    expect(getBankMovementAuditDisplayDescription(src)).toBe(getBankMovementDisplayDescription(src));
  });
});

describe("parity view-model", () => {
  it("misma fuente produce vistas iguales Movimientos/Conciliación", () => {
    const m = movement({
      id: "m1",
      raw_description: "TRANSFERENCIA RECIBIDA ALKITODO SRL",
      description: "otra",
    });
    const a = buildBankMovementListParityView({
      movement: m,
      clientCompanyId: "c1",
      clientName: "Alkitodo",
      simpleState: "asociado",
      isDuplicate: false,
      isHidden: false,
    });
    const b = buildBankMovementListParityView({
      movement: m,
      clientCompanyId: "c1",
      clientName: "Alkitodo",
      simpleState: "asociado",
      isDuplicate: false,
      isHidden: false,
    });
    expect(assertBankMovementParityEqual(a, b)).toEqual([]);
    expect(a.displayDescription).toBe(b.displayDescription);
  });

  it("detecta divergencia de cliente/estado", () => {
    const m = movement({ id: "m1" });
    const a = buildBankMovementListParityView({
      movement: m,
      clientCompanyId: null,
      simpleState: "sin_cliente",
      isDuplicate: false,
      isHidden: false,
    });
    const b = buildBankMovementListParityView({
      movement: m,
      clientCompanyId: "c1",
      clientName: "X",
      simpleState: "asociado",
      isDuplicate: false,
      isHidden: false,
    });
    expect(assertBankMovementParityEqual(a, b)).toContain("clientCompanyId");
    expect(assertBankMovementParityEqual(a, b)).toContain("simpleState");
  });
});

describe("detalle vs card compacta", () => {
  it("el texto completo del helper no se pierde aunque la card use line-clamp", () => {
    const full =
      "TRANSFERENCIA RECIBIDA 4453956LR-2607150 50885600 ALKITODO SRL LINEA2 LINEA3 LINEA4 LINEA5 EXTRA";
    const display = getBankMovementDisplayDescription({ raw_description: full });
    expect(display).toBe(full);
    expect(display.length).toBeGreaterThan(80);
  });
});
