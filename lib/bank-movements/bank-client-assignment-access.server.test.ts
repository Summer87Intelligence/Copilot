import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { canAccessBankInflowAssignmentBatch } from "./bank-client-assignment-access.server";

function database(rows: Array<Record<string, unknown>>, client: unknown = { id: "client" }, error: unknown = null) {
  const movementQuery = { select: vi.fn(), eq: vi.fn(), in: vi.fn() };
  movementQuery.select.mockReturnValue(movementQuery);
  movementQuery.eq.mockReturnValue(movementQuery);
  movementQuery.in.mockResolvedValue({ data: rows, error });
  const clientQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  clientQuery.select.mockReturnValue(clientQuery);
  clientQuery.eq.mockReturnValue(clientQuery);
  clientQuery.maybeSingle.mockResolvedValue({ data: client, error: null });
  const supabase = { from: vi.fn((name: string) => name === "bank_movements" ? movementQuery : clientQuery) };
  return { supabase, movementQuery, clientQuery };
}

describe("preflight de asignaciones solo a ingresos", () => {
  it("permite todo el lote visible y fuerza tenant e ingresos en la consulta", async () => {
    const db = database([{ id: "a", metadata: {} }]);
    expect(await canAccessBankInflowAssignmentBatch(db.supabase as never, "ws", ["a", "a"], "client")).toBe(true);
    expect(db.movementQuery.eq).toHaveBeenCalledWith("workspace_id", "ws");
    expect(db.movementQuery.eq).toHaveBeenCalledWith("direction", "inflow");
    expect(db.clientQuery.eq).toHaveBeenCalledWith("workspace_company_id", "ws");
  });
  it("rechaza lote mixto si un ID es egreso, inexistente o de otro tenant", async () => {
    const db = database([{ id: "a", metadata: {} }]);
    expect(await canAccessBankInflowAssignmentBatch(db.supabase as never, "ws", ["a", "b"], "client")).toBe(false);
  });
  it.each([{ ui_hidden: true }, { duplicate_status: "duplicate_of_import" }])("rechaza movimientos fuera del listado operativo: %j", async (metadata) => {
    const db = database([{ id: "a", metadata }]);
    expect(await canAccessBankInflowAssignmentBatch(db.supabase as never, "ws", ["a"], "client")).toBe(false);
  });
  it("rechaza duplicados por columna y clientes de otro tenant", async () => {
    const duplicate = database([{ id: "a", excluded_from_operations: true }]);
    expect(await canAccessBankInflowAssignmentBatch(duplicate.supabase as never, "ws", ["a"], "client")).toBe(false);
    const foreign = database([{ id: "a" }], null);
    expect(await canAccessBankInflowAssignmentBatch(foreign.supabase as never, "ws", ["a"], "client")).toBe(false);
  });
  it("falla cerrado ante error de base de datos", async () => {
    const db = database([], { id: "client" }, { message: "error" });
    await expect(canAccessBankInflowAssignmentBatch(db.supabase as never, "ws", ["a"], "client")).rejects.toThrow();
  });
});
