/**
 * Unit tests del builder de `Data` para `RESTCuotasV1QueryCliente`.
 *
 * No probamos `fetchZetaInstallments` end-to-end aquí porque eso requiere mock
 * de la stack HTTP completa (zetaInvokeConnectionAndData, resolveInvokePack,
 * logger). El audit script `temp-audits/audit-zeta-due-date-shape.mjs` valida
 * comportamiento live contra Zeta antes de wirear el pipeline.
 *
 * Foco: `buildQueryClienteInData` — para garantizar que:
 *  - defaults de vencimiento y saldo se aplican.
 *  - opcionales vacíos NO se envían (evita 400 binder ASP.NET).
 *  - opcionales válidos se envían como numbers (no strings).
 */
import { describe, expect, it } from "vitest";

import {
  buildQueryClienteInData,
  ZETA_INSTALLMENTS_METHOD,
  ZETA_INSTALLMENTS_ROOT_IN_KEY,
} from "@/lib/integrations/zeta/zeta-installments-fetch";

describe("buildQueryClienteInData — defaults", () => {
  it("aplica defaults de vencimiento y saldo cuando filters vacío", () => {
    const data = buildQueryClienteInData("1", {});
    expect(data.Page).toBe("1");
    expect(data.Filters.CuotaVencimientoDesde).toBe("2000-01-01");
    expect(data.Filters.CuotaVencimientoHasta).toBe("2099-12-31");
    expect(data.Filters.CuotaSaldoDesde).toBe(0);
    expect(data.Filters.CuotaSaldoHasta).toBe(999999999.99999);
  });

  it("no incluye ClienteCodigo, RegistroId, MonedaCodigo cuando ausentes", () => {
    const data = buildQueryClienteInData("1", {});
    expect(data.Filters).not.toHaveProperty("ClienteCodigo");
    expect(data.Filters).not.toHaveProperty("RegistroId");
    expect(data.Filters).not.toHaveProperty("MonedaCodigo");
  });
});

describe("buildQueryClienteInData — opcionales", () => {
  it("incluye ClienteCodigo cuando no vacío", () => {
    const data = buildQueryClienteInData("1", { clienteCodigo: "C0001" });
    expect(data.Filters.ClienteCodigo).toBe("C0001");
  });

  it("NO incluye ClienteCodigo cuando es '' o whitespace", () => {
    const d1 = buildQueryClienteInData("1", { clienteCodigo: "" });
    const d2 = buildQueryClienteInData("1", { clienteCodigo: "   " });
    expect(d1.Filters).not.toHaveProperty("ClienteCodigo");
    expect(d2.Filters).not.toHaveProperty("ClienteCodigo");
  });

  it("incluye RegistroId como number cuando es válido", () => {
    const d1 = buildQueryClienteInData("1", { registroId: 12345 });
    const d2 = buildQueryClienteInData("1", { registroId: "12345" });
    expect(d1.Filters.RegistroId).toBe(12345);
    expect(d2.Filters.RegistroId).toBe(12345);
    expect(typeof d2.Filters.RegistroId).toBe("number");
  });

  it("NO incluye RegistroId si es 0 (Zeta sentinel) o NaN", () => {
    const d1 = buildQueryClienteInData("1", { registroId: 0 });
    const d2 = buildQueryClienteInData("1", { registroId: "abc" });
    expect(d1.Filters).not.toHaveProperty("RegistroId");
    expect(d2.Filters).not.toHaveProperty("RegistroId");
  });

  it("incluye MonedaCodigo como number (1=UYU, 2=USD)", () => {
    const d1 = buildQueryClienteInData("1", { monedaCodigo: 1 });
    const d2 = buildQueryClienteInData("1", { monedaCodigo: "2" });
    expect(d1.Filters.MonedaCodigo).toBe(1);
    expect(d2.Filters.MonedaCodigo).toBe(2);
  });

  it("NO incluye MonedaCodigo si es 0 o vacío", () => {
    const d1 = buildQueryClienteInData("1", { monedaCodigo: 0 });
    const d2 = buildQueryClienteInData("1", { monedaCodigo: "" });
    expect(d1.Filters).not.toHaveProperty("MonedaCodigo");
    expect(d2.Filters).not.toHaveProperty("MonedaCodigo");
  });

  it("respeta vencimiento custom y trimea", () => {
    const data = buildQueryClienteInData("1", {
      cuotaVencimientoDesde: " 2026-01-01 ",
      cuotaVencimientoHasta: "2026-12-31",
    });
    expect(data.Filters.CuotaVencimientoDesde).toBe("2026-01-01");
    expect(data.Filters.CuotaVencimientoHasta).toBe("2026-12-31");
  });

  it("acepta saldo como number o string", () => {
    const d1 = buildQueryClienteInData("1", { cuotaSaldoDesde: 100, cuotaSaldoHasta: 200 });
    const d2 = buildQueryClienteInData("1", { cuotaSaldoDesde: "100", cuotaSaldoHasta: "200" });
    expect(d1.Filters.CuotaSaldoDesde).toBe(100);
    expect(d1.Filters.CuotaSaldoHasta).toBe(200);
    expect(d2.Filters.CuotaSaldoDesde).toBe(100);
    expect(d2.Filters.CuotaSaldoHasta).toBe(200);
  });
});

describe("ZETA_INSTALLMENTS_* constantes", () => {
  it("method y rootInKey coinciden con Postman oficial", () => {
    expect(ZETA_INSTALLMENTS_METHOD).toBe("RESTCuotasV1QueryCliente");
    expect(ZETA_INSTALLMENTS_ROOT_IN_KEY).toBe("QueryClienteIn");
  });
});
