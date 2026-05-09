import { describe, expect, it } from "vitest";

import { mapSaldoRowsToZetaInvoicesBestEffort } from "@/lib/integrations/zeta/zeta-factura-cliente";

describe("mapSaldoRowsToZetaInvoicesBestEffort — hard cutoff pre-2026", () => {
  const companyId = "company-1" as const;

  it("acepta fila con fecha 2026-01-01 (boundary operativo)", () => {
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { RegistroId: "1001", Fecha: "2026-01-01", Total: "5000", Saldo: "5000" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.issueDate).toBe("2026-01-01");
  });

  it("acepta fila con fecha dentro del período operativo", () => {
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { RegistroId: "1002", Fecha: "2026-03-15", Total: "1000", Saldo: "1000" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.issueDate).toBe("2026-03-15");
  });

  it("rechaza fila con fecha 2025-12-31 (pre-operacional)", () => {
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { RegistroId: "2001", Fecha: "2025-12-31", Total: "3000", Saldo: "3000" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("rechaza filas con fechas pre-2025", () => {
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { RegistroId: "2002", Fecha: "2024-06-01", Total: "2000", Saldo: "2000" },
      { RegistroId: "2003", Fecha: "2023-01-01", Total: "1000", Saldo: "1000" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("rechaza fila con Fecha vacía (NO fallback a new Date())", () => {
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { RegistroId: "3001", Fecha: "", Total: "500", Saldo: "500" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("rechaza fila sin Fecha (NO fallback a new Date())", () => {
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { RegistroId: "3002", Total: "500", Saldo: "500" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("filtra pre-2026 pero conserva los 2026+", () => {
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { RegistroId: "100", Fecha: "2025-06-01", Total: "1000", Saldo: "1000" },
      { RegistroId: "101", Fecha: "2026-01-15", Total: "2000", Saldo: "2000" },
      { RegistroId: "102", Fecha: "", Total: "500", Saldo: "500" },
      { RegistroId: "103", Fecha: "2026-03-20", Total: "3000", Saldo: "3000" },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.zetaId)).toEqual(["101", "103"]);
  });

  it("sigue procesando filas sin RegistroId", () => {
    // Filas sin RegistroId son descartadas antes del check de fecha
    const result = mapSaldoRowsToZetaInvoicesBestEffort(companyId, [
      { Fecha: "2026-05-01", Total: "1000" },
    ]);
    expect(result).toHaveLength(0);
  });
});
