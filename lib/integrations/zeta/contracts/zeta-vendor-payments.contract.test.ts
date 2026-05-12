import { describe, expect, it, vi } from "vitest";

import {
  extractZetaVendorPayments,
  isZetaVendorPaymentsQueryResponse,
  readIsLastPageFromVendorPaymentRows,
  readZetaVendorPaymentsQueryOutFlags,
  summarizeZetaVendorPaymentsResponseShape,
} from "@/lib/integrations/zeta/contracts/zeta-vendor-payments.contract";

vi.mock("@/lib/integrations/zeta/zeta-logger", () => ({
  logZetaError: vi.fn(),
}));

const ROW = {
  RegistroId: 9101,
  ProveedorCodigo: "P0001",
  ProveedorNombre: "Proveedor Uno",
  Fecha: "2026-03-15",
  Total: 1500,
  TotalSigno: 1,
  Emitido: "S",
  Serie: "RP",
  Numero: 12,
  IsLastPage: false,
};

describe("zeta-vendor-payments.contract", () => {
  describe("shape: QueryComprobantesOut.Response[]", () => {
    const SAMPLE = {
      QueryComprobantesOut: {
        Succeed: true,
        IsLastPage: true,
        Response: [{ ...ROW, IsLastPage: true }],
      },
    };

    it("acepta y extrae filas", () => {
      expect(isZetaVendorPaymentsQueryResponse(SAMPLE)).toBe(true);
      const rows = extractZetaVendorPayments(SAMPLE);
      expect(rows).toHaveLength(1);
      expect(String(rows[0]?.RegistroId)).toBe("9101");
    });

    it("lee IsLastPage desde QueryComprobantesOut", () => {
      expect(readZetaVendorPaymentsQueryOutFlags(SAMPLE).isLastPage).toBe(true);
    });

    it("summarize detecta path real `QueryComprobantesOut.Response`", () => {
      const s = summarizeZetaVendorPaymentsResponseShape(SAMPLE);
      expect(s.outer_key_detected).toBe("QueryComprobantesOut");
      expect(s.array_path_detected).toBe("QueryComprobantesOut.Response");
      expect(s.rows_detected).toBe(1);
      expect(s.has_registro_id_first_item).toBe(true);
      expect(s.first_item_keys).toContain("RegistroId");
    });
  });

  it("mantiene compatibilidad con QueryOut.Response[]", () => {
    const sample = { QueryOut: { IsLastPage: false, Response: [ROW] } };
    expect(isZetaVendorPaymentsQueryResponse(sample)).toBe(true);
    expect(extractZetaVendorPayments(sample)).toHaveLength(1);
    expect(readZetaVendorPaymentsQueryOutFlags(sample)).toEqual({
      isLastPage: false,
      total: undefined,
    });
  });

  it("acepta array raíz", () => {
    const root = [{ RegistroId: "r1", ProveedorCodigo: "P1" }];
    expect(isZetaVendorPaymentsQueryResponse(root)).toBe(true);
    expect(extractZetaVendorPayments(root)).toHaveLength(1);
    expect(summarizeZetaVendorPaymentsResponseShape(root).array_path_detected).toBe("<root-array>");
  });

  it("encuentra arrays bajo claves fallback", () => {
    expect(extractZetaVendorPayments({ QueryComprobantesOut: { Recibos: [ROW] } })).toHaveLength(1);
    expect(extractZetaVendorPayments({ QueryComprobantesOut: { Items: [ROW] } })).toHaveLength(1);
    expect(extractZetaVendorPayments({ QueryComprobantesOut: { Data: [ROW] } })).toHaveLength(1);
  });

  it("rechaza filas sin RegistroId y acepta respuesta vacía", () => {
    expect(isZetaVendorPaymentsQueryResponse({ QueryComprobantesOut: { Response: [{ ProveedorCodigo: "A" }] } })).toBe(false);
    expect(extractZetaVendorPayments({ QueryComprobantesOut: { Response: [{ ProveedorCodigo: "A" }] } })).toEqual([]);
    expect(isZetaVendorPaymentsQueryResponse({ QueryComprobantesOut: { Response: [] } })).toBe(true);
  });

  it("lee IsLastPage desde la última fila cuando el outer no lo trae", () => {
    const rows = extractZetaVendorPayments({ QueryOut: { Response: [{ ...ROW, IsLastPage: false }] } });
    expect(readIsLastPageFromVendorPaymentRows(rows)).toBe(false);
  });
});
