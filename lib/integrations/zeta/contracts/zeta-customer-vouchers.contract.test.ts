import { describe, expect, it, vi } from "vitest";

import {
  extractZetaCustomerVouchers,
  isZetaCustomerVouchersQueryResponse,
} from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";

vi.mock("@/lib/integrations/zeta/zeta-logger", () => ({
  logZetaError: vi.fn(),
}));

const LEGACY_QUERY_OUT = {
  QueryOut: {
    Success: true,
    IsLastPage: true,
    Response: [
      {
        ComprobanteCodigo: 701,
        Serie: "A",
        Numero: 1254,
        Fecha: "2026-03-15",
        ClienteCodigo: "C0001",
        ClienteNombre: "Cliente Demo",
        TotalRecibo: 15000,
        Lineas: [{ ArticuloCodigo: "A001" }],
        Pagos: [{ FormaPagoCodigo: 1 }],
      },
    ],
  },
};

const WSDL_ENVELOPE = {
  ComprobantesClienteV1QueryOut: {
    Succeed: true,
    Response: {
      ListaMovimientos: {
        MovimientoItem: [
          {
            ComprobanteCodigo: 702,
            Serie: "B",
            Numero: 2,
            Fecha: "2026-04-01",
            ClienteCodigo: "C0002",
            TotalRecibo: 100,
          },
        ],
      },
    },
  },
};

describe("zeta-customer-vouchers.contract", () => {
  it("ComprobantesClienteV1QueryOut.Response.ListaMovimientos.MovimientoItem (WSDL)", () => {
    expect(isZetaCustomerVouchersQueryResponse(WSDL_ENVELOPE)).toBe(true);
    const rows = extractZetaCustomerVouchers(WSDL_ENVELOPE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ClienteCodigo).toBe("C0002");
    expect(rows[0]?.ComprobanteCodigo).toBe(702);
  });

  it("QueryOut.Response con comprobantes (legacy)", () => {
    expect(isZetaCustomerVouchersQueryResponse(LEGACY_QUERY_OUT)).toBe(true);
    const rows = extractZetaCustomerVouchers(LEGACY_QUERY_OUT);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ClienteCodigo).toBe("C0001");
  });

  it("array raíz documentado", () => {
    const root = [{ ComprobanteCodigo: 1, Serie: "B", Numero: 9 }];
    expect(isZetaCustomerVouchersQueryResponse(root)).toBe(true);
    expect(extractZetaCustomerVouchers(root)).toHaveLength(1);
  });

  it("rechaza filas sin identidad (sin ComprobanteCodigo ni Serie+Numero)", () => {
    const bad = { QueryOut: { Response: [{ Serie: "A" }] } };
    expect(isZetaCustomerVouchersQueryResponse(bad)).toBe(true);
    expect(extractZetaCustomerVouchers(bad)).toHaveLength(0);
  });

  it("admite fila solo con Serie+Numero (sin ComprobanteCodigo)", () => {
    const env = {
      ComprobantesClienteV1QueryOut: {
        Succeed: true,
        Response: {
          ListaMovimientos: {
            MovimientoItem: [
              {
                Serie: "Z",
                Numero: 99,
                Fecha: "2026-03-01",
                ClienteCodigo: "CLI1",
                TotalRecibo: 10,
              },
            ],
          },
        },
      },
    };
    expect(isZetaCustomerVouchersQueryResponse(env)).toBe(true);
    const rows = extractZetaCustomerVouchers(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Serie).toBe("Z");
  });
});
