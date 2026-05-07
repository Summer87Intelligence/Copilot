/**
 * Regresión del payload `Data = { Page, Filters }` enviado a
 * `RESTRecibosCobranzaV2QueryComprobantes`.
 *
 * Garantiza que NO se reintroduzca la causa del HTTP 400 documentada en
 * `temp-audits/audit-receipts-payload-shape.md`:
 *
 *  - filtros opcionales NO van como `""` (binder ASP.NET rechaza `int.Parse("")`),
 *  - `Mes` NO se envía con `padStart` (ej.: "01"),
 *  - claves obligatorias `Anio` / `Mes` siempre presentes,
 *  - cuando los opcionales tienen valor real, se incluyen tal cual (string trimmed).
 */
import { describe, expect, it } from "vitest";

import { buildQueryInData } from "@/lib/integrations/zeta/zeta-collection-receipts-fetch";

describe("zeta-collection-receipts-fetch · buildQueryInData", () => {
  it("omite todos los opcionales cuando vienen vacíos o ausentes (causa raíz HTTP 400)", () => {
    const data = buildQueryInData("1", { mes: "1", anio: "2026" });

    expect(data).toEqual({
      Page: "1",
      Filters: {
        Anio: "2026",
        Mes: "1",
      },
    });

    const filtersKeys = Object.keys(data.Filters);
    expect(filtersKeys).toEqual(["Anio", "Mes"]);
    expect(filtersKeys).not.toContain("ClienteCodigo");
    expect(filtersKeys).not.toContain("ComprobanteCodigo");
    expect(filtersKeys).not.toContain("MonedaCodigo");
    expect(filtersKeys).not.toContain("LocalCodigo");
    expect(filtersKeys).not.toContain("CobradorCodigo");
  });

  it("omite opcionales con string vacío o solo whitespace (no genera ClienteCodigo='' etc.)", () => {
    const data = buildQueryInData("1", {
      mes: "3",
      anio: "2026",
      clienteCodigo: "",
      comprobanteCodigo: "   ",
      monedaCodigo: "",
      localCodigo: "",
      cobradorCodigo: "  ",
    });

    expect(data.Filters).toEqual({ Anio: "2026", Mes: "3" });
    for (const key of [
      "ClienteCodigo",
      "ComprobanteCodigo",
      "MonedaCodigo",
      "LocalCodigo",
      "CobradorCodigo",
    ] as const) {
      expect(Object.prototype.hasOwnProperty.call(data.Filters, key)).toBe(false);
    }
  });

  it("Mes NO se envía con padStart: '01' input → '1' output, y casos sin ceros se preservan", () => {
    expect(buildQueryInData("1", { mes: "01", anio: "2026" }).Filters.Mes).toBe("1");
    expect(buildQueryInData("1", { mes: "1", anio: "2026" }).Filters.Mes).toBe("1");
    expect(buildQueryInData("1", { mes: "10", anio: "2026" }).Filters.Mes).toBe("10");
    expect(buildQueryInData("1", { mes: "12", anio: "2026" }).Filters.Mes).toBe("12");
    expect(buildQueryInData("1", { mes: "  05  ", anio: "2026" }).Filters.Mes).toBe("5");
  });

  it("incluye opcionales con valor real, trimmeados, sin alterar el casing del payload", () => {
    const data = buildQueryInData("2", {
      mes: "4",
      anio: "2026",
      clienteCodigo: "  C0001  ",
      comprobanteCodigo: " 701 ",
      monedaCodigo: "1",
      localCodigo: "1",
      cobradorCodigo: "COB1",
    });

    expect(data).toEqual({
      Page: "2",
      Filters: {
        Anio: "2026",
        Mes: "4",
        ClienteCodigo: "C0001",
        ComprobanteCodigo: "701",
        MonedaCodigo: "1",
        LocalCodigo: "1",
        CobradorCodigo: "COB1",
      },
    });
  });

  it("`Anio` y `Page` se mantienen como string numérico (no se castean a number)", () => {
    const data = buildQueryInData("3", { mes: "1", anio: "2026" });
    expect(typeof data.Page).toBe("string");
    expect(typeof data.Filters.Anio).toBe("string");
    expect(typeof data.Filters.Mes).toBe("string");
    expect(data.Page).toBe("3");
    expect(data.Filters.Anio).toBe("2026");
  });

  it("orden estable: claves obligatorias primero, opcionales después en orden de aparición", () => {
    const data = buildQueryInData("1", {
      mes: "1",
      anio: "2026",
      cobradorCodigo: "COB1",
      clienteCodigo: "C0001",
    });
    expect(Object.keys(data.Filters)).toEqual([
      "Anio",
      "Mes",
      "ClienteCodigo",
      "CobradorCodigo",
    ]);
  });
});
