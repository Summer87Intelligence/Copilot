import { describe, expect, it } from "vitest";

import {
  buildZetaVendorPaymentNumber,
  mapCopilotVendorPaymentToProtoPaymentInput,
  mapEmitidoToVendorPaymentStatus,
  mapZetaVendorPaymentToCopilot,
  normalizeZetaVendorPaymentCurrency,
} from "@/lib/integrations/zeta/zeta-vendor-payments-mapper";

describe("zeta-vendor-payments-mapper", () => {
  it("construye identidad deterministica desde RegistroId", () => {
    expect(buildZetaVendorPaymentNumber(" 9101 ")).toBe("ZETA:PAG:9101");
  });

  it("mapea Emitido S/N/fallback", () => {
    expect(mapEmitidoToVendorPaymentStatus("S")).toBe("paid");
    expect(mapEmitidoToVendorPaymentStatus("N")).toBe("void");
    expect(mapEmitidoToVendorPaymentStatus(null)).toBe("paid");
    expect(mapEmitidoToVendorPaymentStatus("otro")).toBe("paid");
  });

  it("normaliza moneda por codigo y simbolo", () => {
    expect(normalizeZetaVendorPaymentCurrency("1", "$")).toBe("UYU");
    expect(normalizeZetaVendorPaymentCurrency("2", "U$S")).toBe("USD");
    expect(normalizeZetaVendorPaymentCurrency(null, "US$")).toBe("USD");
    expect(normalizeZetaVendorPaymentCurrency(null, "$  ")).toBe("UYU");
    expect(normalizeZetaVendorPaymentCurrency("999", "???")).toBeNull();
  });

  it("mapea pago valido a ProtoPaymentInput source=zeta y company_id null", () => {
    const mapped = mapZetaVendorPaymentToCopilot({
      RegistroId: 9102,
      ProveedorCodigo: "P1",
      ProveedorNombre: "Proveedor Uno",
      ProveedorRazonSocial: "Proveedor Uno S.A.",
      Fecha: "20260115",
      Total: 305,
      TotalSigno: 1,
      MonedaCodigo: "2",
      MonedaSimbolo: "U$S",
      Emitido: "S",
      Serie: "A",
      Numero: 725,
      ComprobanteNombre: "Recibo de pago",
      CajaCodigo: 1,
      CajaNombre: "Caja Principal",
    });
    expect(mapped).not.toBeNull();
    if (!mapped) throw new Error("expected mapped payment");

    const result = mapCopilotVendorPaymentToProtoPaymentInput(mapped, "run-1");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.input.company_id).toBeNull();
    expect(result.input.payment_number).toBe("ZETA:PAG:9102");
    expect(result.input.payment_date).toBe("2026-01-15");
    expect(result.input.amount).toBe(305);
    expect(result.input.currency_code).toBe("USD");
    expect(result.input.source).toBe("zeta");
    expect(result.input.status).toBe("paid");
    expect(result.input.category).toBe("Recibo de pago");
    expect(result.input.vendor_name).toBe("Proveedor Uno S.A.");
    expect(result.input.reference).toBe("A-725");
    expect(result.input.obligation_id).toBeNull();
    expect(result.input.zeta_metadata).toMatchObject({
      zeta_registro_id: "9102",
      caja_nombre: "Caja Principal",
      proveedor_codigo: "P1",
    });
  });

  it("usa ProveedorNombre si no hay RazonSocial", () => {
    const mapped = mapZetaVendorPaymentToCopilot({
      RegistroId: 9103,
      ProveedorNombre: "Proveedor Fallback",
      Fecha: "2026-01-15",
      Total: 100,
      MonedaCodigo: "1",
    });
    if (!mapped) throw new Error("expected mapped payment");
    const result = mapCopilotVendorPaymentToProtoPaymentInput(mapped, "run-1");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.input.vendor_name).toBe("Proveedor Fallback");
  });

  it("preserva raw_payload completo en notes", () => {
    const mapped = mapZetaVendorPaymentToCopilot({
      RegistroId: 9104,
      Fecha: "2026-01-15",
      Total: "1.234,56",
      MonedaCodigo: "1",
      CampoExtra: "valor",
    });
    if (!mapped) throw new Error("expected mapped payment");
    const result = mapCopilotVendorPaymentToProtoPaymentInput(mapped, "run-1");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const notes = JSON.parse(result.input.notes ?? "{}");
    expect(notes.zeta_vendor_payment_v1.raw_payload.CampoExtra).toBe("valor");
    expect(result.input.amount).toBe(1234.56);
  });

  it("rechaza fecha invalida sin fallback", () => {
    const mapped = mapZetaVendorPaymentToCopilot({
      RegistroId: 9105,
      Fecha: "15/01/2026",
      Total: 100,
      MonedaCodigo: "1",
    });
    if (!mapped) throw new Error("expected mapped payment");
    const result = mapCopilotVendorPaymentToProtoPaymentInput(mapped, "run-1");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("invalid_fecha");
  });

  it("rechaza fecha pre-operacional", () => {
    const mapped = mapZetaVendorPaymentToCopilot({
      RegistroId: 9106,
      Fecha: "2025-12-31",
      Total: 100,
      MonedaCodigo: "1",
    });
    if (!mapped) throw new Error("expected mapped payment");
    const result = mapCopilotVendorPaymentToProtoPaymentInput(mapped, "run-1");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("pre_operational_date");
  });

  it("rechaza monto negativo o invalido", () => {
    const neg = mapZetaVendorPaymentToCopilot({
      RegistroId: 9107,
      Fecha: "2026-01-15",
      Total: 100,
      TotalSigno: -1,
      MonedaCodigo: "1",
    });
    if (!neg) throw new Error("expected mapped payment");
    const negResult = mapCopilotVendorPaymentToProtoPaymentInput(neg, "run-1");
    expect(negResult.ok).toBe(false);
    if (negResult.ok) throw new Error("expected failure");
    expect(negResult.reason).toBe("negative_amount");

    const invalid = mapZetaVendorPaymentToCopilot({
      RegistroId: 9108,
      Fecha: "2026-01-15",
      Total: "nope",
      MonedaCodigo: "1",
    });
    if (!invalid) throw new Error("expected mapped payment");
    const invalidResult = mapCopilotVendorPaymentToProtoPaymentInput(invalid, "run-1");
    expect(invalidResult.ok).toBe(false);
    if (invalidResult.ok) throw new Error("expected failure");
    expect(invalidResult.reason).toBe("invalid_amount");
  });

  it("ignora filas sin RegistroId", () => {
    expect(mapZetaVendorPaymentToCopilot({ Fecha: "2026-01-15", Total: 100 })).toBeNull();
  });
});
