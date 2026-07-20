import { describe, it, expect } from "vitest";

import { buildSellerOptions, hasAnySellerAssigned, findUnassignedSellerRow } from "@/lib/sales/seller-ux-helpers";

describe("buildSellerOptions", () => {
  it("no incluye 'Sin asignar' (esa opción vive aparte, siempre primero en la UI)", () => {
    const opts = buildSellerOptions(null, null, [{ id: "d", displayName: "Daniel" }]);
    expect(opts.some((o) => o.id === "")).toBe(false);
  });

  it("preserva el orden de personas activas tal cual llega (alfabético desde el repositorio)", () => {
    const active = [
      { id: "c", displayName: "Camila" },
      { id: "d", displayName: "Daniel" },
      { id: "j", displayName: "Juanma" },
    ];
    const opts = buildSellerOptions(null, null, active);
    expect(opts.map((o) => o.displayName)).toEqual(["Camila", "Daniel", "Juanma"]);
    expect(opts.every((o) => !o.disabled)).toBe(true);
  });

  it("vendedor actual inactivo: aparece como histórico deshabilitado, no se puede volver a elegir", () => {
    const active = [{ id: "c", displayName: "Camila" }]; // Daniel ya no está activo
    const opts = buildSellerOptions("d-inactivo", "Daniel", active);
    const inactiveEntry = opts.find((o) => o.id === "d-inactivo");
    expect(inactiveEntry).toBeDefined();
    expect(inactiveEntry?.disabled).toBe(true);
    expect(inactiveEntry?.displayName).toContain("Daniel");
    expect(inactiveEntry?.displayName).toContain("inactivo");
    // Sigue estando Camila, seleccionable.
    expect(opts.find((o) => o.id === "c")?.disabled).toBeFalsy();
  });

  it("vendedor actual SIN nombre conocido (edge case) usa fallback legible", () => {
    const opts = buildSellerOptions("ghost", null, []);
    expect(opts[0]?.displayName).toContain("Vendedor inactivo");
  });

  it("vendedor actual activo: no se duplica como entrada histórica", () => {
    const active = [{ id: "d", displayName: "Daniel" }];
    const opts = buildSellerOptions("d", "Daniel", active);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toEqual({ id: "d", displayName: "Daniel" });
  });

  it("sin vendedor actual (null): solo lista a los activos, sin entrada histórica", () => {
    const active = [{ id: "d", displayName: "Daniel" }];
    const opts = buildSellerOptions(null, null, active);
    expect(opts).toEqual([{ id: "d", displayName: "Daniel" }]);
  });
});

describe("hasAnySellerAssigned", () => {
  it("false cuando todas las filas son 'Sin vendedor identificado' o sin operaciones", () => {
    expect(hasAnySellerAssigned([{ sellerId: null, invoiceCount: 62 }])).toBe(false);
    expect(hasAnySellerAssigned([{ sellerId: "d", invoiceCount: 0 }])).toBe(false);
  });

  it("true cuando existe al menos un vendedor real con operaciones", () => {
    expect(
      hasAnySellerAssigned([
        { sellerId: null, invoiceCount: 62 },
        { sellerId: "d", invoiceCount: 1 },
      ])
    ).toBe(true);
  });
});

describe("findUnassignedSellerRow", () => {
  it("encuentra la fila 'Sin vendedor identificado' (sellerId=null)", () => {
    const rows = [{ sellerId: "d" as string | null }, { sellerId: null }];
    expect(findUnassignedSellerRow(rows)?.sellerId).toBeNull();
  });

  it("undefined si no existe (caso teórico, la agregación siempre la incluye)", () => {
    const rows = [{ sellerId: "d" as string | null }];
    expect(findUnassignedSellerRow(rows)).toBeUndefined();
  });
});
