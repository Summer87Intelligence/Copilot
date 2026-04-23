import { describe, expect, it, vi } from "vitest";

import {
  extractZetaCommercialClientData,
  isZetaCommercialClientQueryResponse,
} from "@/lib/integrations/zeta/contracts/zeta-commercial-data-client.contract";

vi.mock("@/lib/integrations/zeta/zeta-logger", () => ({
  logZetaError: vi.fn(),
}));

/** Ejemplo alineado a ayuda Query + métodos generales (Response bajo QueryOut). */
const SAMPLE_QUERY_OUT = {
  QueryOut: {
    Success: true,
    IsLastPage: true,
    TotalRegistros: 1,
    Response: [
      {
        Codigo: "P0001",
        Nombre: "Cliente Demo",
        Rut: 40349070015,
        Activo: "S",
        CategoriaCodigo: "001",
        CategoriaNombre: "Nacional",
        CondicionCodigo: "030",
        CondicionNombre: "30 días",
        PorcentajeDto1: 2.5,
        PorcentajeDto2: 0,
        PorcentajeDto3: 0,
        IVA: "01",
        LocalCodigo: 1,
        LocalNombre: "Casa Central",
        CodigoContable: "211001",
        ContribuyenteEBoleta: "N",
        FechaRegistro: "2026-01-15",
      },
    ],
  },
};

describe("zeta-commercial-data-client.contract", () => {
  it("acepta QueryOut.Response[]", () => {
    expect(isZetaCommercialClientQueryResponse(SAMPLE_QUERY_OUT)).toBe(true);
    const rows = extractZetaCommercialClientData(SAMPLE_QUERY_OUT);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Codigo).toBe("P0001");
  });

  it("acepta array raíz con Codigo", () => {
    const root = [{ Codigo: "X1", Activo: "S" }];
    expect(isZetaCommercialClientQueryResponse(root)).toBe(true);
    expect(extractZetaCommercialClientData(root)).toHaveLength(1);
  });

  it("rechaza estructura sin Codigo en filas", () => {
    const bad = { QueryOut: { Response: [{ Nombre: "sin codigo" }] } };
    expect(isZetaCommercialClientQueryResponse(bad)).toBe(true);
    expect(extractZetaCommercialClientData(bad)).toHaveLength(0);
  });
});
