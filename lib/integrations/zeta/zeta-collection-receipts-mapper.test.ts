import { describe, expect, it } from "vitest";

import {
  buildZetaCollectionReceiptNumber,
  mapCopilotCollectionReceiptToProtoReceiptInput,
  mapZetaCollectionReceiptToCopilot,
  normalizeZetaReceiptCurrency,
} from "@/lib/integrations/zeta/zeta-collection-receipts-mapper";

describe("zeta-collection-receipts-mapper", () => {
  it("construye identidad deterministica desde RegistroId", () => {
    expect(buildZetaCollectionReceiptNumber(" 9001 ")).toBe("ZETA:COB:9001");
  });

  it("normaliza moneda por codigo y por simbolo", () => {
    expect(normalizeZetaReceiptCurrency("1", "$")).toBe("UYU");
    expect(normalizeZetaReceiptCurrency("2", "U$S")).toBe("USD");
    expect(normalizeZetaReceiptCurrency(null, "$  ")).toBe("UYU");
    expect(normalizeZetaReceiptCurrency(null, "U$S")).toBe("USD");
    expect(normalizeZetaReceiptCurrency("999", "???")).toBeNull();
  });

  it("prioriza Descripcion como payment_method sobre CajaNombre y CobradorNombre", () => {
    const mapped = mapZetaCollectionReceiptToCopilot({
      RegistroId: 9001,
      ClienteCodigo: "185",
      Fecha: "2026-03-04",
      Total: 9760,
      TotalSigno: 1,
      Descripcion: "Transf Bria",
      CajaNombre: "Caja Principal",
      CobradorNombre: "Cobrador A",
      MonedaCodigo: "1",
      MonedaSimbolo: "$  ",
      Emitido: "S",
      Serie: "A",
      Numero: 724,
    });

    expect(mapped?.medio_pago).toBe("Transf Bria");
    expect(mapped?.currency_code).toBe("UYU");
    expect(mapped?.referencia_documento).toBe("A-724");
  });

  it("mapea recibo valido a ProtoReceiptInput sin invoice_id y soporta company_id unresolved", () => {
    const mapped = mapZetaCollectionReceiptToCopilot({
      RegistroId: 9002,
      ClienteNombre: "Consumidor Final",
      Fecha: "20260115",
      Total: 305,
      TotalSigno: 1,
      MonedaCodigo: "2",
      MonedaSimbolo: "U$S",
      Emitido: "S",
      Serie: "A",
      Numero: 725,
    });
    expect(mapped).not.toBeNull();
    if (!mapped) throw new Error("expected mapped receipt");

    const result = mapCopilotCollectionReceiptToProtoReceiptInput(null, mapped, "run-1");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.input.company_id).toBeNull();
    expect(result.input.invoice_id).toBeNull();
    expect(result.input.receipt_number).toBe("ZETA:COB:9002");
    expect(result.input.receipt_date).toBe("2026-01-15");
    expect(result.input.amount).toBe(305);
    expect(result.input.currency_code).toBe("USD");
    expect(result.input.status).toBe("paid");
  });

  it("rechaza anulaciones / importes negativos sin persistirlas", () => {
    const mapped = mapZetaCollectionReceiptToCopilot({
      RegistroId: 9003,
      Fecha: "2026-01-15",
      Total: 100,
      TotalSigno: -1,
      MonedaCodigo: "1",
    });
    expect(mapped?.importe).toBe(-100);
    if (!mapped) throw new Error("expected mapped receipt");

    const result = mapCopilotCollectionReceiptToProtoReceiptInput("company-1", mapped, "run-1");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok=false");
    expect(result.reason).toBe("negative_amount");
  });

  it("rechaza fecha no parseable sin fallback", () => {
    const mapped = mapZetaCollectionReceiptToCopilot({
      RegistroId: 9004,
      Fecha: "15/01/2026",
      Total: 100,
      TotalSigno: 1,
      MonedaCodigo: "1",
    });
    expect(mapped).not.toBeNull();
    if (!mapped) throw new Error("expected mapped receipt");

    const result = mapCopilotCollectionReceiptToProtoReceiptInput("company-1", mapped, "run-1");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok=false");
    expect(result.reason).toBe("invalid_fecha");
    if (result.reason !== "invalid_fecha") throw new Error(`expected invalid_fecha, got ${result.reason}`);
    expect(result.raw_fecha).toBe("15/01/2026");
  });
});
