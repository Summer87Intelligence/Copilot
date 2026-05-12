/**
 * Unit tests del mapper de cuotas pendientes Zeta (`RESTCuotasV1QueryCliente`).
 *
 * Cubre:
 *  - Canonical PascalCase shape (Postman oficial).
 *  - camelCase shape (algunos tenants).
 *  - snake_case fallback.
 *  - String-numeric inputs ("15000.00000", "15.000,00").
 *  - Fechas en múltiples formatos.
 *  - Moneda mapping (1=UYU, 2=USD, otros=null).
 *  - `EsEntregaInicial` en distintos formatos (S/N, true/false, 1/0).
 *  - Filas inválidas (sin RegistroId / sin CuotaNumero / fechas malas) → discards.
 *  - Batch mapping con mix de filas válidas/inválidas.
 */
import { describe, expect, it } from "vitest";

import {
  mapZetaInstallment,
  mapZetaInstallmentsBatch,
} from "@/lib/integrations/zeta/zeta-installments-mapper";

describe("mapZetaInstallment — canonical Postman shape", () => {
  it("acepta la fila canónica de la doc oficial (PascalCase, números, fecha ISO)", () => {
    const row = {
      RegistroId: 1254,
      ClienteCodigo: "C0001",
      CuotaNumero: 3,
      CuotaVencimiento: "2026-03-20",
      MonedaCodigo: 1,
      CuotaTotal: 15000.0,
      CuotaSaldo: 5000.0,
      EsEntregaInicial: "N",
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.installment.zeta_registro_id).toBe(1254);
    expect(r.installment.cliente_codigo).toBe("C0001");
    expect(r.installment.cuota_numero).toBe(3);
    expect(r.installment.cuota_vencimiento).toBe("2026-03-20");
    expect(r.installment.moneda_codigo).toBe(1);
    expect(r.installment.currency_code).toBe("UYU");
    expect(r.installment.cuota_total).toBe(15000);
    expect(r.installment.cuota_saldo).toBe(5000);
    expect(r.installment.es_entrega_inicial).toBe(false);
    expect(r.installment.raw_payload).toBe(row);
  });

  it("USD se mapea a 'USD' cuando MonedaCodigo=2", () => {
    const row = {
      RegistroId: 9001,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-05-15",
      MonedaCodigo: 2,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.currency_code).toBe("USD");
  });

  it("MonedaCodigo desconocido devuelve currency_code null pero conserva moneda_codigo raw", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 99,
      CuotaTotal: 1,
      CuotaSaldo: 1,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.currency_code).toBeNull();
    expect(r.installment.moneda_codigo).toBe(99);
  });
});

describe("mapZetaInstallment — variaciones de casing", () => {
  it("camelCase también es aceptado", () => {
    const row = {
      registroId: 2001,
      clienteCodigo: "C0010",
      cuotaNumero: 2,
      cuotaVencimiento: "2026-04-10",
      monedaCodigo: 1,
      cuotaTotal: 50000,
      cuotaSaldo: 25000,
      esEntregaInicial: true,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.zeta_registro_id).toBe(2001);
    expect(r.installment.cuota_numero).toBe(2);
    expect(r.installment.es_entrega_inicial).toBe(true);
  });

  it("snake_case fallback", () => {
    const row = {
      registro_id: 3001,
      cuota_numero: 1,
      cuota_vencimiento: "2026-06-01",
      moneda_codigo: 2,
      cuota_total: 200,
      cuota_saldo: 100,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.zeta_registro_id).toBe(3001);
    expect(r.installment.currency_code).toBe("USD");
  });
});

describe("mapZetaInstallment — parsing numérico", () => {
  it("acepta strings numéricos canónicos con 5 decimales Zeta", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: "15000.00000",
      CuotaSaldo: "5000.50000",
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.cuota_total).toBe(15000);
    expect(r.installment.cuota_saldo).toBe(5000.5);
  });

  it("acepta formato es-UY '15.000,00' (algunos tenants ASP.NET serializan así)", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: "15.000,00",
      CuotaSaldo: "5.000,50",
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.cuota_total).toBe(15000);
    expect(r.installment.cuota_saldo).toBe(5000.5);
  });

  it("acepta coma decimal sin separador de miles ('5000,50')", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: "5000",
      CuotaSaldo: "5000,50",
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.cuota_saldo).toBe(5000.5);
  });

  it("rechaza fila sin CuotaTotal", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaSaldo: 5000,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("CuotaTotal");
  });

  it("rechaza fila sin CuotaSaldo", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 5000,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("CuotaSaldo");
  });
});

describe("mapZetaInstallment — fechas", () => {
  it("acepta ISO con hora 'YYYY-MM-DDTHH:MM:SS' (strip tiempo)", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-03-20T00:00:00",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.cuota_vencimiento).toBe("2026-03-20");
  });

  it("acepta ISO con zona Z", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-03-20T00:00:00.000Z",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.cuota_vencimiento).toBe("2026-03-20");
  });

  it("acepta formato es-UY 'DD/MM/YYYY'", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "20/03/2026",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.cuota_vencimiento).toBe("2026-03-20");
  });

  it("rechaza fila con fecha no parseable", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "not-a-date",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("CuotaVencimiento");
  });

  it("rechaza fila sin CuotaVencimiento", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("CuotaVencimiento");
  });
});

describe("mapZetaInstallment — EsEntregaInicial", () => {
  it("'S' → true", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
      EsEntregaInicial: "S",
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.es_entrega_inicial).toBe(true);
  });

  it("'N' → false", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
      EsEntregaInicial: "N",
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.es_entrega_inicial).toBe(false);
  });

  it("boolean true → true", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
      EsEntregaInicial: true,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.es_entrega_inicial).toBe(true);
  });

  it("número 1 → true, 0 → false", () => {
    const r1 = mapZetaInstallment({
      RegistroId: 1, CuotaNumero: 1, CuotaVencimiento: "2026-01-01", MonedaCodigo: 1,
      CuotaTotal: 100, CuotaSaldo: 100, EsEntregaInicial: 1,
    });
    const r0 = mapZetaInstallment({
      RegistroId: 1, CuotaNumero: 1, CuotaVencimiento: "2026-01-01", MonedaCodigo: 1,
      CuotaTotal: 100, CuotaSaldo: 100, EsEntregaInicial: 0,
    });
    if (!r1.ok || !r0.ok) throw new Error("debió mapear");
    expect(r1.installment.es_entrega_inicial).toBe(true);
    expect(r0.installment.es_entrega_inicial).toBe(false);
  });

  it("ausente → null", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    if (!r.ok) throw new Error(r.error);
    expect(r.installment.es_entrega_inicial).toBeNull();
  });
});

describe("mapZetaInstallment — rechazos", () => {
  it("rechaza null", () => {
    const r = mapZetaInstallment(null);
    expect(r.ok).toBe(false);
  });

  it("rechaza array", () => {
    const r = mapZetaInstallment([1, 2, 3]);
    expect(r.ok).toBe(false);
  });

  it("rechaza string", () => {
    const r = mapZetaInstallment("foo");
    expect(r.ok).toBe(false);
  });

  it("rechaza fila sin RegistroId", () => {
    const row = {
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("RegistroId");
  });

  it("rechaza fila con RegistroId = 0 (Zeta usa 0 como sentinel ausente)", () => {
    const row = {
      RegistroId: 0,
      CuotaNumero: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
  });

  it("rechaza fila sin CuotaNumero", () => {
    const row = {
      RegistroId: 1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("CuotaNumero");
  });

  it("rechaza fila con CuotaNumero negativo", () => {
    const row = {
      RegistroId: 1,
      CuotaNumero: -1,
      CuotaVencimiento: "2026-01-01",
      MonedaCodigo: 1,
      CuotaTotal: 100,
      CuotaSaldo: 100,
    };
    const r = mapZetaInstallment(row);
    expect(r.ok).toBe(false);
  });
});

describe("mapZetaInstallmentsBatch", () => {
  it("mapea válidas y reporta inválidas", () => {
    const rows = [
      {
        RegistroId: 1,
        CuotaNumero: 1,
        CuotaVencimiento: "2026-01-01",
        MonedaCodigo: 1,
        CuotaTotal: 100,
        CuotaSaldo: 50,
      },
      // inválida: sin RegistroId
      {
        CuotaNumero: 1,
        CuotaVencimiento: "2026-01-01",
        MonedaCodigo: 1,
        CuotaTotal: 100,
        CuotaSaldo: 50,
      },
      // inválida: fecha mala
      {
        RegistroId: 2,
        CuotaNumero: 1,
        CuotaVencimiento: "bad-date",
        MonedaCodigo: 1,
        CuotaTotal: 100,
        CuotaSaldo: 50,
      },
      // válida USD
      {
        RegistroId: 3,
        CuotaNumero: 1,
        CuotaVencimiento: "2026-02-01",
        MonedaCodigo: 2,
        CuotaTotal: 100,
        CuotaSaldo: 50,
      },
    ];
    const r = mapZetaInstallmentsBatch(rows);
    expect(r.mapped).toHaveLength(2);
    expect(r.discards).toHaveLength(2);
    expect(r.discards[0].index).toBe(1);
    expect(r.discards[0].reason).toContain("RegistroId");
    expect(r.discards[1].index).toBe(2);
    expect(r.discards[1].reason).toContain("CuotaVencimiento");
    expect(r.mapped[0].zeta_registro_id).toBe(1);
    expect(r.mapped[1].zeta_registro_id).toBe(3);
    expect(r.mapped[1].currency_code).toBe("USD");
  });

  it("array vacío produce mapped/discards vacíos", () => {
    const r = mapZetaInstallmentsBatch([]);
    expect(r.mapped).toEqual([]);
    expect(r.discards).toEqual([]);
  });

  it("conserva el orden de las filas mapeadas", () => {
    const rows = [
      { RegistroId: 10, CuotaNumero: 1, CuotaVencimiento: "2026-01-01", MonedaCodigo: 1, CuotaTotal: 1, CuotaSaldo: 1 },
      { RegistroId: 20, CuotaNumero: 1, CuotaVencimiento: "2026-01-01", MonedaCodigo: 1, CuotaTotal: 1, CuotaSaldo: 1 },
      { RegistroId: 30, CuotaNumero: 1, CuotaVencimiento: "2026-01-01", MonedaCodigo: 1, CuotaTotal: 1, CuotaSaldo: 1 },
    ];
    const r = mapZetaInstallmentsBatch(rows);
    expect(r.mapped.map((m) => m.zeta_registro_id)).toEqual([10, 20, 30]);
  });

  it("incluye sample_keys en discards para diagnóstico", () => {
    const rows = [
      // sin RegistroId
      { CuotaNumero: 1, CuotaVencimiento: "2026-01-01", CuotaTotal: 1, CuotaSaldo: 1 },
    ];
    const r = mapZetaInstallmentsBatch(rows);
    expect(r.discards[0].sample_keys).toContain("CuotaNumero");
  });
});
