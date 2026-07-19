import { describe, expect, it } from "vitest";

import {
  listActiveSuggestionsForMovements,
  listHistoricalReviewSuggestions,
  listOperationalSuggestions,
} from "@/lib/bank/intelligence/server/repositories";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;

/** Mock de Supabase que filtra realmente por eq()/in() para probar aislamiento por scope. */
function scopedClient(rows: Row[]) {
  return {
    from() {
      const filters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          inFilters[col] = vals;
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          let out = rows;
          for (const [k, v] of Object.entries(filters)) out = out.filter((r) => r[k] === v);
          for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
          return resolve({ data: out, error: null });
        },
      };
      return builder;
    },
  };
}

const opRow: Row = {
  id: "op-1", workspace_id: WS, bank_movement_id: "m1", confidence: 50,
  reasons: ["MATCHING_RECEIPT"], warnings: [], recommended_action: "REVIEW",
  engine_version: 1, status: "generated", suggestion_scope: "operational",
};
const histRow: Row = {
  id: "hist-1", workspace_id: WS, bank_movement_id: "m2", confidence: 50,
  reasons: ["MATCHING_RECEIPT"], warnings: ["HISTORICAL_SHADOW_AUDIT"], recommended_action: "REVIEW",
  engine_version: 1, status: "generated", suggestion_scope: "historical_review",
};

describe("aislamiento estructural de consultas por suggestion_scope", () => {
  it("listOperationalSuggestions excluye históricas", async () => {
    const client = scopedClient([opRow, histRow]);
    const rows = await listOperationalSuggestions(client as never, WS);
    expect(rows.map((r) => r.id)).toEqual(["op-1"]);
    expect(rows[0]!.suggestionScope).toBe("operational");
  });

  it("listHistoricalReviewSuggestions excluye operativas", async () => {
    const client = scopedClient([opRow, histRow]);
    const rows = await listHistoricalReviewSuggestions(client as never, WS);
    expect(rows.map((r) => r.id)).toEqual(["hist-1"]);
    expect(rows[0]!.suggestionScope).toBe("historical_review");
  });

  it("filas sin suggestion_scope (pre-migración) se leen como operational", async () => {
    const legacy: Row = { ...opRow, id: "legacy-1", bank_movement_id: "m3" };
    delete (legacy as { suggestion_scope?: unknown }).suggestion_scope;
    // Consulta que NO filtra por scope (idempotencia): el mapeo por defecto aplica.
    const client = scopedClient([legacy]);
    const rows = await listActiveSuggestionsForMovements(client as never, WS, ["m3"], 1);
    expect(rows[0]!.suggestionScope).toBe("operational");
  });
});
