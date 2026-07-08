import { describe, expect, it } from "vitest";

import { fetchAllRowsPaginated } from "@/lib/data/proto-analytics-read-repository";

type Row = { id: number };

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i }));
}

/** Factory de query paginada respaldada por un array en memoria (simula `.range(from, to)`). */
function pagedFactoryFrom(rows: Row[]) {
  return ({ from, to }: { from: number; to: number }) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null });
}

describe("fetchAllRowsPaginated", () => {
  it("trae todas las filas cuando la tabla supera el pageSize (7.914 filas, pageSize 1000 → 8 páginas)", async () => {
    const rows = makeRows(7914);
    const result = await fetchAllRowsPaginated(pagedFactoryFrom(rows), { pageSize: 1000 });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(7914);
    expect(result.data[0]).toEqual({ id: 0 });
    expect(result.data[7913]).toEqual({ id: 7913 });
    expect(result.meta.pagesFetched).toBe(8);
    expect(result.meta.rowsFetched).toBe(7914);
    expect(result.meta.truncatedAtMaxRows).toBe(false);
  });

  it("no repite ni pierde filas cuando el total es múltiplo exacto del pageSize", async () => {
    const rows = makeRows(2000);
    const result = await fetchAllRowsPaginated(pagedFactoryFrom(rows), { pageSize: 1000 });

    expect(result.data).toHaveLength(2000);
    expect(result.data.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    // 2 páginas llenas + 1 página final vacía que confirma el fin — sin loop infinito.
    expect(result.meta.pagesFetched).toBe(3);
  });

  it("propaga el error de una página intermedia conservando las filas ya traídas", async () => {
    const rows = makeRows(2500);
    let calls = 0;
    const factory = ({ from, to }: { from: number; to: number }) => {
      calls += 1;
      if (calls === 2) {
        return Promise.resolve({ data: null, error: { message: "boom" } });
      }
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    };

    const result = await fetchAllRowsPaginated(factory, { pageSize: 1000 });

    expect(result.error).toEqual({ message: "boom" });
    expect(result.data).toHaveLength(1000);
    expect(result.meta.pagesFetched).toBe(2);
  });

  it("corta de forma segura al alcanzar maxRows y lo reporta explícitamente", async () => {
    const rows = makeRows(10_000);
    const result = await fetchAllRowsPaginated(pagedFactoryFrom(rows), {
      pageSize: 1000,
      maxRows: 3000,
    });

    expect(result.data).toHaveLength(3000);
    expect(result.error).toBeNull();
    expect(result.meta.truncatedAtMaxRows).toBe(true);
    expect(result.meta.maxRows).toBe(3000);
  });

  it("devuelve vacío sin iterar cuando la primera página ya viene vacía", async () => {
    const result = await fetchAllRowsPaginated(pagedFactoryFrom([]), { pageSize: 1000 });

    expect(result.data).toEqual([]);
    expect(result.meta.pagesFetched).toBe(1);
    expect(result.meta.truncatedAtMaxRows).toBe(false);
  });
});
