/**
 * Vista Datos — clientes (`proto_companies`) importados desde Zeta con naming original en columnas.
 * Centraliza lectura de etiquetas y celdas sin persistir ni renombrar columnas en backend.
 */

import type { DataRow } from "@/lib/copilot-data";

/** Nombre visible principal: Zeta primero, luego columnas legacy si existieran. */
export function companyPrimaryLabel(row: DataRow): string {
  const s = String(row.RazonSocial ?? row.Nombre ?? row.name ?? "").trim();
  return s || "Sin nombre";
}

/** Valor de celda para columnas configuradas en la tabla de empresas (incluye fallbacks). */
export function companyCellValue(row: DataRow, columnKey: string): unknown {
  if (columnKey === "RazonSocial") {
    return row.RazonSocial ?? row.Nombre ?? row.name ?? "";
  }
  if (columnKey === "Direccion") {
    return row.DireccionCompleta ?? row.Direccion ?? "";
  }
  return row[columnKey];
}
