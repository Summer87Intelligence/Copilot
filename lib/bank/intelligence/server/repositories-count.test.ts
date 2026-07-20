import { describe, expect, it } from "vitest";

import { countOperationalConfirmedSince } from "@/lib/bank/intelligence/server/repositories";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;

/** Mock de Supabase con soporte de count "exact"/head + gte(), para el contador "Conciliados hoy". */
function countingClient(rows: Row[]) {
  return {
    from() {
      const filters: Record<string, unknown> = {};
      let gteCol: string | null = null;
      let gteVal: string | null = null;
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        gte(col: string, val: string) {
          gteCol = col;
          gteVal = val;
          return builder;
        },
        then(resolve: (v: { count: number; error: null }) => void) {
          let out = rows;
          for (const [k, v] of Object.entries(filters)) out = out.filter((r) => r[k] === v);
          if (gteCol) out = out.filter((r) => String(r[gteCol!]) >= (gteVal as string));
          return resolve({ count: out.length, error: null });
        },
      };
      return builder;
    },
  };
}

describe("countOperationalConfirmedSince — contador 'Conciliados hoy'", () => {
  it("cuenta solo operational + confirmed a partir de reviewed_at, nunca histórico/auditoría", async () => {
    const client = countingClient([
      { id: "1", workspace_id: WS, suggestion_scope: "operational", status: "confirmed", reviewed_at: "2026-07-20T10:00:00.000Z" },
      { id: "2", workspace_id: WS, suggestion_scope: "operational", status: "confirmed", reviewed_at: "2026-07-19T10:00:00.000Z" },
      { id: "3", workspace_id: WS, suggestion_scope: "operational", status: "generated", reviewed_at: null },
      { id: "4", workspace_id: WS, suggestion_scope: "historical_review", status: "confirmed", reviewed_at: "2026-07-20T10:00:00.000Z" },
    ]);

    const count = await countOperationalConfirmedSince(client as never, WS, "2026-07-20T03:00:00.000Z");
    expect(count).toBe(1);
  });
});
