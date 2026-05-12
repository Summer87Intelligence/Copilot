/**
 * Unit tests del contract de cuotas pendientes (`RESTCuotasV1QueryCliente`).
 *
 * Cubre los 4 shapes soportados + flags de paginación + summary para logs.
 */
import { describe, expect, it } from "vitest";

import {
  extractZetaInstallments,
  isZetaInstallmentsQueryResponse,
  readZetaInstallmentsQueryOutFlags,
  summarizeZetaInstallmentsResponseShape,
} from "@/lib/integrations/zeta/contracts/zeta-installments.contract";

describe("isZetaInstallmentsQueryResponse", () => {
  it("acepta QueryClienteOut.Response[] (canonical Postman)", () => {
    const raw = {
      QueryClienteOut: {
        Succeed: true,
        Response: [{ RegistroId: 1, CuotaNumero: 1 }],
        IsLastPage: true,
      },
    };
    expect(isZetaInstallmentsQueryResponse(raw)).toBe(true);
  });

  it("acepta QueryOut.Response[] (compat genérico)", () => {
    const raw = {
      QueryOut: {
        Succeed: true,
        Response: [{ RegistroId: 1, CuotaNumero: 1 }],
      },
    };
    expect(isZetaInstallmentsQueryResponse(raw)).toBe(true);
  });

  it("acepta array raíz", () => {
    const raw = [{ RegistroId: 1, CuotaNumero: 1 }];
    expect(isZetaInstallmentsQueryResponse(raw)).toBe(true);
  });

  it("acepta QueryClienteOut.Cuotas[] (fallback)", () => {
    const raw = {
      QueryClienteOut: {
        Succeed: true,
        Cuotas: [{ RegistroId: 1, CuotaNumero: 1 }],
      },
    };
    expect(isZetaInstallmentsQueryResponse(raw)).toBe(true);
  });

  it("rechaza objetos sin estructura reconocible", () => {
    expect(isZetaInstallmentsQueryResponse({ foo: "bar" })).toBe(false);
    expect(isZetaInstallmentsQueryResponse({ QueryClienteOut: {} })).toBe(false);
  });

  it("rechaza null y primitives", () => {
    expect(isZetaInstallmentsQueryResponse(null)).toBe(false);
    expect(isZetaInstallmentsQueryResponse("foo")).toBe(false);
    expect(isZetaInstallmentsQueryResponse(42)).toBe(false);
  });
});

describe("extractZetaInstallments", () => {
  it("extrae filas válidas y descarta sin RegistroId", () => {
    const raw = {
      QueryClienteOut: {
        Response: [
          { RegistroId: 1, CuotaNumero: 1, CuotaVencimiento: "2026-01-01" },
          { CuotaNumero: 1, CuotaVencimiento: "2026-01-02" }, // sin RegistroId
          { RegistroId: 2, CuotaNumero: 2, CuotaVencimiento: "2026-02-01" },
        ],
      },
    };
    const rows = extractZetaInstallments(raw);
    expect(rows).toHaveLength(2);
    expect((rows[0] as { RegistroId: number }).RegistroId).toBe(1);
    expect((rows[1] as { RegistroId: number }).RegistroId).toBe(2);
  });

  it("descarta filas sin CuotaNumero", () => {
    const raw = {
      QueryClienteOut: {
        Response: [
          { RegistroId: 1 }, // sin CuotaNumero
          { RegistroId: 2, CuotaNumero: 1, CuotaVencimiento: "2026-01-01" },
        ],
      },
    };
    expect(extractZetaInstallments(raw)).toHaveLength(1);
  });

  it("acepta array raíz", () => {
    const raw = [
      { RegistroId: 1, CuotaNumero: 1, CuotaVencimiento: "2026-01-01" },
      { RegistroId: 2, CuotaNumero: 1, CuotaVencimiento: "2026-02-01" },
    ];
    expect(extractZetaInstallments(raw)).toHaveLength(2);
  });

  it("array vacío devuelve []", () => {
    expect(extractZetaInstallments({ QueryClienteOut: { Response: [] } })).toEqual([]);
  });

  it("shape inválido devuelve []", () => {
    expect(extractZetaInstallments({ foo: "bar" })).toEqual([]);
    expect(extractZetaInstallments(null)).toEqual([]);
  });
});

describe("readZetaInstallmentsQueryOutFlags", () => {
  it("lee IsLastPage true", () => {
    const flags = readZetaInstallmentsQueryOutFlags({
      QueryClienteOut: { IsLastPage: true, Response: [] },
    });
    expect(flags.isLastPage).toBe(true);
  });

  it("lee IsLastPage false desde string 'false'", () => {
    const flags = readZetaInstallmentsQueryOutFlags({
      QueryClienteOut: { IsLastPage: "false", Response: [] },
    });
    expect(flags.isLastPage).toBe(false);
  });

  it("lee Total como número", () => {
    const flags = readZetaInstallmentsQueryOutFlags({
      QueryClienteOut: { Total: 42, Response: [] },
    });
    expect(flags.total).toBe(42);
  });

  it("acepta 'S'/'N' como booleans (formato Zeta UY)", () => {
    expect(readZetaInstallmentsQueryOutFlags({
      QueryClienteOut: { IsLastPage: "S", Response: [] },
    }).isLastPage).toBe(true);
    expect(readZetaInstallmentsQueryOutFlags({
      QueryClienteOut: { IsLastPage: "N", Response: [] },
    }).isLastPage).toBe(false);
  });
});

describe("summarizeZetaInstallmentsResponseShape", () => {
  it("resume QueryClienteOut canónico", () => {
    const s = summarizeZetaInstallmentsResponseShape({
      QueryClienteOut: { Response: [{ RegistroId: 1, CuotaNumero: 1 }] },
    });
    expect(s.outer_name).toBe("QueryClienteOut");
    expect(s.response_array_length).toBe(1);
    expect(s.is_array_root).toBe(false);
  });

  it("detecta array raíz", () => {
    const s = summarizeZetaInstallmentsResponseShape([
      { RegistroId: 1 }, { RegistroId: 2 },
    ]);
    expect(s.is_array_root).toBe(true);
    expect(s.response_array_length).toBe(2);
  });

  it("shape no reconocible", () => {
    const s = summarizeZetaInstallmentsResponseShape({ foo: "bar" });
    expect(s.outer_name).toBeNull();
    expect(s.response_array_length).toBeNull();
  });
});
