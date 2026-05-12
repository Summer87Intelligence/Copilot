import { describe, expect, it } from "vitest";

import { buildQueryInData } from "@/lib/integrations/zeta/zeta-vendor-payments-fetch";

describe("zeta-vendor-payments-fetch · buildQueryInData", () => {
  it("omite opcionales vacíos y conserva Anio/Mes obligatorios", () => {
    const data = buildQueryInData("1", { mes: "1", anio: "2026" });

    expect(data).toEqual({
      Page: "1",
      Filters: {
        Anio: "2026",
        Mes: "1",
      },
    });
    expect(Object.keys(data.Filters)).toEqual(["Anio", "Mes"]);
  });

  it("omite strings vacíos o whitespace para evitar HTTP 400 del binder Zeta", () => {
    const data = buildQueryInData("1", {
      mes: "3",
      anio: "2026",
      proveedorCodigo: "",
      comprobanteCodigo: "   ",
      monedaCodigo: "",
      localCodigo: "  ",
    });

    expect(data.Filters).toEqual({ Anio: "2026", Mes: "3" });
    expect(data.Filters).not.toHaveProperty("ProveedorCodigo");
    expect(data.Filters).not.toHaveProperty("ComprobanteCodigo");
    expect(data.Filters).not.toHaveProperty("MonedaCodigo");
    expect(data.Filters).not.toHaveProperty("LocalCodigo");
  });

  it("Mes no se envía con ceros a la izquierda", () => {
    expect(buildQueryInData("1", { mes: "01", anio: "2026" }).Filters.Mes).toBe("1");
    expect(buildQueryInData("1", { mes: "  05  ", anio: "2026" }).Filters.Mes).toBe("5");
    expect(buildQueryInData("1", { mes: "12", anio: "2026" }).Filters.Mes).toBe("12");
  });

  it("incluye opcionales con valor real, trimmeados, con nombres Postman", () => {
    const data = buildQueryInData("2", {
      mes: "4",
      anio: "2026",
      proveedorCodigo: "  P0001  ",
      comprobanteCodigo: " 701 ",
      monedaCodigo: "2",
      localCodigo: "1",
    });

    expect(data).toEqual({
      Page: "2",
      Filters: {
        Anio: "2026",
        Mes: "4",
        ProveedorCodigo: "P0001",
        ComprobanteCodigo: "701",
        MonedaCodigo: "2",
        LocalCodigo: "1",
      },
    });
  });

  it("Page y Anio se mantienen como string", () => {
    const data = buildQueryInData("3", { mes: "1", anio: "2026" });
    expect(typeof data.Page).toBe("string");
    expect(typeof data.Filters.Anio).toBe("string");
    expect(data.Page).toBe("3");
  });
});
