import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auditDuplicateBankMovements } = await import("@/lib/bank/canonical/duplicate-import-audit.server");

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeClient(tables: Tables) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const eqFilters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let notNullCol: string | null = null;
      let isNullCol: string | null = null;
      let gteCol: string | null = null;
      let gteVal: string | null = null;
      let lteCol: string | null = null;
      let lteVal: string | null = null;

      function apply(): Row[] {
        let out = rows;
        for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
        for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
        if (notNullCol) out = out.filter((r) => r[notNullCol!] != null);
        if (isNullCol) out = out.filter((r) => r[isNullCol!] == null);
        if (gteCol) out = out.filter((r) => String(r[gteCol!]) >= gteVal!);
        if (lteCol) out = out.filter((r) => String(r[lteCol!]) <= lteVal!);
        return out;
      }

      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          eqFilters[col] = val;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          inFilters[col] = vals;
          return builder;
        },
        not(col: string, op: string) {
          if (op === "is") notNullCol = col;
          // .not("status", "in", "(...)") — el fake ignora el filtro de exclusión
          // de status (excluded/revoked); los fixtures ya vienen sin esas filas.
          return builder;
        },
        is(col: string, val: unknown) {
          if (val === null) isNullCol = col;
          return builder;
        },
        gte(col: string, val: string) {
          gteCol = col;
          gteVal = val;
          return builder;
        },
        lte(col: string, val: string) {
          lteCol = col;
          lteVal = val;
          return builder;
        },
        limit() {
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          return resolve({ data: apply(), error: null });
        },
      };
      return builder;
    },
  };
}

const RANGE: [string, string] = ["2026-01-01", "2026-07-20"];

describe("auditDuplicateBankMovements — caso real Nirmex (Excel + PDF)", () => {
  it("agrupa las dos filas por huella y propone la primera creada como canónica (sin asociaciones)", async () => {
    const client = fakeClient({
      bank_movements: [
        {
          id: "mov-excel",
          workspace_id: WS,
          movement_date: "2026-04-10",
          amount: 7567,
          currency: "UYU",
          bank_reference: "TR0082544541",
          account_label: "Santander 000001211749 UYU",
          created_at: "2026-07-10T00:39:10Z",
        },
        {
          id: "mov-pdf",
          workspace_id: WS,
          movement_date: "2026-04-10",
          amount: 7567,
          currency: "UYU",
          bank_reference: "TR0082544541",
          account_label: "Santander 000001211749 UYU",
          created_at: "2026-07-10T13:03:36Z",
        },
      ],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.movementIds.sort()).toEqual(["mov-excel", "mov-pdf"]);
    expect(groups[0]!.canonicalMovementId).toBe("mov-excel");
    expect(groups[0]!.duplicateMovementIds).toEqual(["mov-pdf"]);
    expect(groups[0]!.canonicalReason).toBe("earliest_created");
  });
});

describe("auditDuplicateBankMovements — caso real Samysol (link financiero gana pese a no ser el primero)", () => {
  it("la fila con link real es canónica aunque se haya creado antes o después", async () => {
    const client = fakeClient({
      bank_movements: [
        {
          id: "mov-with-link",
          workspace_id: WS,
          movement_date: "2026-07-07",
          amount: 318.18,
          currency: "USD",
          bank_reference: "926466",
          account_label: "Santander 005101107711 USD",
          created_at: "2026-07-10T13:03:32Z",
        },
        {
          id: "mov-without-link",
          workspace_id: WS,
          movement_date: "2026-07-07",
          amount: 318.18,
          currency: "USD",
          bank_reference: "926466",
          account_label: "Santander 005101107711 USD",
          created_at: "2026-07-21T15:49:12Z",
        },
      ],
      bank_movement_reconciliation_links: [
        { workspace_id: WS, bank_movement_id: "mov-with-link", archived_at: null },
      ],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups[0]!.canonicalMovementId).toBe("mov-with-link");
    expect(groups[0]!.canonicalReason).toBe("has_link");
  });

  it("un link archivado (revertido) no cuenta como asociación real", async () => {
    const client = fakeClient({
      bank_movements: [
        { id: "mov-a", workspace_id: WS, movement_date: "2026-07-07", amount: 318.18, currency: "USD", bank_reference: "926466", account_label: "Santander 005101107711 USD", created_at: "2026-07-10T13:03:32Z" },
        { id: "mov-b", workspace_id: WS, movement_date: "2026-07-07", amount: 318.18, currency: "USD", bank_reference: "926466", account_label: "Santander 005101107711 USD", created_at: "2026-07-21T15:49:12Z" },
      ],
      bank_movement_reconciliation_links: [
        { workspace_id: WS, bank_movement_id: "mov-b", archived_at: "2026-07-22T00:00:00Z" },
      ],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups[0]!.canonicalReason).toBe("earliest_created");
    expect(groups[0]!.canonicalMovementId).toBe("mov-a");
  });
});

describe("auditDuplicateBankMovements — prioridad de asociaciones", () => {
  it("sugerencia gana sobre identificación cuando no hay link", async () => {
    const client = fakeClient({
      bank_movements: [
        { id: "mov-ident", workspace_id: WS, movement_date: "2026-02-01", amount: 1000, currency: "UYU", bank_reference: "REF1", account_label: "Santander 000001211749 UYU", created_at: "2026-07-10T00:00:00Z" },
        { id: "mov-sugg", workspace_id: WS, movement_date: "2026-02-01", amount: 1000, currency: "UYU", bank_reference: "REF1", account_label: "Santander 000001211749 UYU", created_at: "2026-07-10T01:00:00Z" },
      ],
      bank_movement_client_identifications: [{ workspace_id: WS, movement_id: "mov-ident", status: "identified" }],
      bank_reconciliation_suggestions: [{ workspace_id: WS, bank_movement_id: "mov-sugg" }],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups[0]!.canonicalMovementId).toBe("mov-sugg");
    expect(groups[0]!.canonicalReason).toBe("has_suggestion");
  });
});

describe("auditDuplicateBankMovements — no falsos positivos", () => {
  it("misma fecha/importe pero distinta referencia bancaria -> no es duplicado", async () => {
    const client = fakeClient({
      bank_movements: [
        { id: "mov-1", workspace_id: WS, movement_date: "2026-03-01", amount: 5000, currency: "UYU", bank_reference: "REF-A", account_label: "Santander 000001211749 UYU", created_at: "2026-01-01T00:00:00Z" },
        { id: "mov-2", workspace_id: WS, movement_date: "2026-03-01", amount: 5000, currency: "UYU", bank_reference: "REF-B", account_label: "Santander 000001211749 UYU", created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups).toHaveLength(0);
  });

  it("misma referencia pero distinta cuenta -> no es duplicado", async () => {
    const client = fakeClient({
      bank_movements: [
        { id: "mov-1", workspace_id: WS, movement_date: "2026-03-01", amount: 5000, currency: "UYU", bank_reference: "REF-A", account_label: "Santander 000001211749 UYU", created_at: "2026-01-01T00:00:00Z" },
        { id: "mov-2", workspace_id: WS, movement_date: "2026-03-01", amount: 5000, currency: "UYU", bank_reference: "REF-A", account_label: "Santander 005101107711 UYU", created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups).toHaveLength(0);
  });

  it("movimientos sin bank_reference se excluyen de la auditoría (nunca fusionar sin referencia)", async () => {
    const client = fakeClient({
      bank_movements: [],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups).toHaveLength(0);
  });
});

describe("auditDuplicateBankMovements — idempotencia y batch", () => {
  it("reprocesar el mismo dataset produce el mismo resultado", async () => {
    const tables = {
      bank_movements: [
        { id: "mov-excel", workspace_id: WS, movement_date: "2026-04-10", amount: 7567, currency: "UYU", bank_reference: "TR0082544541", account_label: "Santander 000001211749 UYU", created_at: "2026-07-10T00:39:10Z" },
        { id: "mov-pdf", workspace_id: WS, movement_date: "2026-04-10", amount: 7567, currency: "UYU", bank_reference: "TR0082544541", account_label: "Santander 000001211749 UYU", created_at: "2026-07-10T13:03:36Z" },
      ],
    };
    const first = await auditDuplicateBankMovements(fakeClient(tables) as never, WS, ...RANGE);
    const second = await auditDuplicateBankMovements(fakeClient(tables) as never, WS, ...RANGE);
    expect(first).toEqual(second);
  });

  it("grupo de 3 filas (mismo importe/referencia, tres import distintos) reporta 1 canónica + 2 duplicadas", async () => {
    const client = fakeClient({
      bank_movements: [
        { id: "mov-1", workspace_id: WS, movement_date: "2026-06-04", amount: 17080, currency: "UYU", bank_reference: "TT-3-OF-3", account_label: "Santander 000001211749 UYU", created_at: "2026-06-04T00:00:00Z" },
        { id: "mov-2", workspace_id: WS, movement_date: "2026-06-04", amount: 17080, currency: "UYU", bank_reference: "TT-3-OF-3", account_label: "Santander 000001211749 UYU", created_at: "2026-07-10T00:00:00Z" },
        { id: "mov-3", workspace_id: WS, movement_date: "2026-06-04", amount: 17080, currency: "UYU", bank_reference: "TT-3-OF-3", account_label: "Santander 000001211749 UYU", created_at: "2026-07-21T00:00:00Z" },
      ],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.movementIds).toHaveLength(3);
    expect(groups[0]!.canonicalMovementId).toBe("mov-1");
    expect(groups[0]!.duplicateMovementIds.sort()).toEqual(["mov-2", "mov-3"]);
  });

  it("BANK-GLOBAL-DEDUPE-BACKFILL-001 (regresión producción): con 200+ movimientos, un grupo duplicado que cruza el límite de troceo del .in() sigue detectando la identificación real", async () => {
    // Reproduce el bug real de producción: PostgREST rechaza .in() con ~400+
    // ids (header overflow). El lector trocea en bloques de 200 — este test
    // arma >200 movimientos y coloca el par duplicado exactamente sobre el
    // límite del primer bloque (índices 199/200), con la identificación en
    // la fila que cae en el SEGUNDO bloque, para probar que el merge entre
    // bloques no pierde información.
    const fillers = Array.from({ length: 199 }, (_, i) => ({
      id: `filler-${i}`,
      workspace_id: WS,
      movement_date: "2026-01-01",
      amount: 1,
      currency: "UYU",
      bank_reference: `FILLER-${i}`,
      account_label: "Santander 000001211749 UYU",
      created_at: "2026-01-01T00:00:00Z",
    }));
    const client = fakeClient({
      bank_movements: [
        ...fillers,
        { id: "mov-boundary-a", workspace_id: WS, movement_date: "2026-06-04", amount: 17080, currency: "UYU", bank_reference: "TT-BOUNDARY", account_label: "Santander 000001211749 UYU", created_at: "2026-06-04T00:00:00Z" },
        { id: "mov-boundary-b", workspace_id: WS, movement_date: "2026-06-04", amount: 17080, currency: "UYU", bank_reference: "TT-BOUNDARY", account_label: "Santander 000001211749 UYU", created_at: "2026-07-10T00:00:00Z" },
      ],
      bank_movement_client_identifications: [
        { workspace_id: WS, movement_id: "mov-boundary-b", status: "identified" },
      ],
    });
    const groups = await auditDuplicateBankMovements(client as never, WS, ...RANGE);
    const group = groups.find((g) => g.movementIds.includes("mov-boundary-a"));
    expect(group).toBeDefined();
    expect(group!.canonicalMovementId).toBe("mov-boundary-b");
    expect(group!.canonicalReason).toBe("has_identification");
  });
});
