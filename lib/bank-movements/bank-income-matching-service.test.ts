import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  confirmIncomeMatch,
  rejectIncomeMatch,
} from "@/lib/bank-movements/bank-income-matching-service.server";

/**
 * Fake mínimo de Supabase: una cola FIFO de resultados que se consume en cada
 * terminal (await / single / maybeSingle). Registra los inserts para asertar.
 */
function fakeSupabase(results: Array<{ data?: unknown; error?: unknown }>) {
  let i = 0;
  const inserts: Array<{ table: string; row: unknown }> = [];
  let currentTable = "";
  const next = () => results[i++] ?? { data: null, error: null };

  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(next());
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => Promise.resolve(next());
        }
        if (prop === "from") {
          return (table: string) => {
            currentTable = table;
            return proxy;
          };
        }
        if (prop === "insert") {
          return (row: unknown) => {
            inserts.push({ table: currentTable, row });
            return proxy;
          };
        }
        return () => proxy;
      },
    }
  );

  return { supabase: proxy as never, inserts };
}

const WS = "ws";
const USER = "user1";
const MOVEMENT = { id: "mov1", description: "TRANSFERENCIA RECIBIDA JP SOLUCIONES SAS 183" };

describe("confirmIncomeMatch", () => {
  it("19/23. crea match confirmado (client_id solo, sin concepto)", async () => {
    const { supabase, inserts } = fakeSupabase([
      { data: null }, // no existe confirmado previo
      { data: { id: "match1" } }, // insert match
    ]);
    const res = await confirmIncomeMatch({
      supabase,
      workspaceId: WS,
      userId: USER,
      movement: MOVEMENT,
      clientId: "fixerware",
    });
    expect(res.match_id).toBe("match1");
    expect(res.alias_created).toBe(false);
    const matchInsert = inserts.find((x) => x.table === "bank_income_matches");
    expect((matchInsert?.row as Record<string, unknown>).match_status).toBe("confirmed");
    expect((matchInsert?.row as Record<string, unknown>).billing_concept_id).toBeNull();
  });

  it("21. recordar alias crea client_bank_alias aprendido", async () => {
    const { supabase, inserts } = fakeSupabase([
      { data: null }, // no confirmado previo
      { data: { id: "match2" } }, // insert match
      { data: null }, // no dupe alias
      { error: null }, // insert alias
    ]);
    const res = await confirmIncomeMatch({
      supabase,
      workspaceId: WS,
      userId: USER,
      movement: MOVEMENT,
      clientId: "fixerware",
      rememberAlias: true,
    });
    expect(res.alias_created).toBe(true);
    const aliasInsert = inserts.find((x) => x.table === "client_bank_aliases");
    expect(aliasInsert).toBeTruthy();
    const row = aliasInsert!.row as Record<string, unknown>;
    expect(row.alias_type).toBe("learned");
    expect(row.learned_from_bank_movement_id).toBe("mov1");
    expect(row.normalized_alias).toBe("jp soluciones");
  });

  it("22. no duplica alias si ya existe uno igual activo", async () => {
    const { supabase, inserts } = fakeSupabase([
      { data: null }, // no confirmado previo
      { data: { id: "match3" } }, // insert match
      { data: { id: "existing-alias" } }, // dupe existe
    ]);
    const res = await confirmIncomeMatch({
      supabase,
      workspaceId: WS,
      userId: USER,
      movement: MOVEMENT,
      clientId: "fixerware",
      rememberAlias: true,
    });
    expect(res.alias_created).toBe(false);
    expect(inserts.some((x) => x.table === "client_bank_aliases")).toBe(false);
  });
});

describe("no toca caja/facturas/Zeta (28/29/30)", () => {
  it("confirmar solo escribe en bank_income_matches y client_bank_aliases", async () => {
    const { supabase, inserts } = fakeSupabase([
      { data: null },
      { data: { id: "m" } },
      { data: null },
      { error: null },
    ]);
    await confirmIncomeMatch({
      supabase,
      workspaceId: WS,
      userId: USER,
      movement: MOVEMENT,
      clientId: "fixerware",
      billingConceptId: "concept1",
      rememberAlias: true,
    });
    const tablesWritten = new Set(inserts.map((x) => x.table));
    expect([...tablesWritten].sort()).toEqual(["bank_income_matches", "client_bank_aliases"]);
    // Ninguna tabla de caja/facturas/recibos/zeta.
    for (const t of tablesWritten) {
      expect(t).not.toMatch(/manual_cash|proto_invoices|proto_receipts|zeta|treasury/);
    }
  });
});

describe("rejectIncomeMatch", () => {
  it("20. crea fila rejected", async () => {
    const { supabase, inserts } = fakeSupabase([{ data: { id: "rej1" } }]);
    const res = await rejectIncomeMatch({
      supabase,
      workspaceId: WS,
      userId: USER,
      movementId: "mov1",
      clientId: "fixerware",
    });
    expect(res.match_id).toBe("rej1");
    const row = inserts[0]!.row as Record<string, unknown>;
    expect(row.match_status).toBe("rejected");
  });
});
