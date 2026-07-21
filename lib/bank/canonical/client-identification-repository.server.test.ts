import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getActiveIdentificationForMovement,
  listActiveIdentificationsForMovements,
  listIdentificationsForClient,
  insertIdentification,
  revokeIdentification,
} = await import("@/lib/bank/canonical/client-identification-repository.server");

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_WS = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const MOV = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ACTOR = "dddddddd-dddd-dddd-dddd-dddddddddddd";

type Row = Record<string, unknown>;

function row(over: Partial<Row> = {}): Row {
  return {
    id: "id-1",
    workspace_id: WS,
    movement_id: MOV,
    client_company_id: CLIENT,
    payer_identity_id: null,
    status: "identified",
    identification_mode: "manual_single",
    reason: null,
    confirmed_by: ACTOR,
    confirmed_at: "2026-07-21T00:00:00Z",
    revoked_at: null,
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
    ...over,
  };
}

function fakeClient(rows: Row[], opts: { insertError?: { message: string }; updateError?: { message: string } } = {}) {
  let inserted: Row | null = null;
  return {
    from(table: string) {
      expect(table).toBe("bank_movement_client_identifications");
      const eqFilters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let excludeStatuses = false;
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
        not(col: string, _op: string, _val: unknown) {
          if (col === "status") excludeStatuses = true;
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          let out = rows;
          for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
          if (excludeStatuses) out = out.filter((r) => r.status !== "excluded" && r.status !== "revoked");
          return Promise.resolve({ data: out[0] ?? null, error: null });
        },
        insert(payload: Row) {
          inserted = { id: "id-new", ...payload };
          return {
            select() {
              return this;
            },
            single() {
              if (opts.insertError) return Promise.resolve({ data: null, error: opts.insertError });
              return Promise.resolve({ data: inserted, error: null });
            },
          };
        },
        update(payload: Row) {
          return {
            eq(col: string, val: unknown) {
              eqFilters[col] = val;
              return this;
            },
            then(resolve: (v: { error: { message: string } | null }) => void) {
              return resolve({ error: opts.updateError ?? null });
            },
          };
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          let out = rows;
          for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
          for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
          if (excludeStatuses) out = out.filter((r) => r.status !== "excluded" && r.status !== "revoked");
          return resolve({ data: out, error: null });
        },
      };
      return builder;
    },
    _inserted: () => inserted,
  };
}

describe("getActiveIdentificationForMovement", () => {
  it("devuelve la identificación activa cuando existe", async () => {
    const client = fakeClient([row()]);
    const result = await getActiveIdentificationForMovement(client as never, WS, MOV);
    expect(result?.clientCompanyId).toBe(CLIENT);
    expect(result?.status).toBe("identified");
  });

  it("nunca cruza workspace (aislamiento de tenant)", async () => {
    const client = fakeClient([row({ workspace_id: OTHER_WS })]);
    const result = await getActiveIdentificationForMovement(client as never, WS, MOV);
    expect(result).toBeNull();
  });

  it("excluye revoked/excluded", async () => {
    const client = fakeClient([row({ status: "revoked" })]);
    const result = await getActiveIdentificationForMovement(client as never, WS, MOV);
    expect(result).toBeNull();
  });

  it("exige workspaceId no vacío", async () => {
    await expect(getActiveIdentificationForMovement(fakeClient([]) as never, "", MOV)).rejects.toThrow(
      "WORKSPACE_REQUIRED"
    );
  });
});

describe("listActiveIdentificationsForMovements", () => {
  it("devuelve vacío para lista vacía sin consultar la base", async () => {
    const client = fakeClient([row()]);
    expect(await listActiveIdentificationsForMovements(client as never, WS, [])).toEqual([]);
  });

  it("filtra por workspace y por conjunto de movimientos", async () => {
    const client = fakeClient([
      row({ id: "a", movement_id: "m1" }),
      row({ id: "b", movement_id: "m2" }),
      row({ id: "c", movement_id: "m3" }),
    ]);
    const result = await listActiveIdentificationsForMovements(client as never, WS, ["m1", "m3"]);
    expect(result.map((r) => r.movementId).sort()).toEqual(["m1", "m3"]);
  });
});

describe("listIdentificationsForClient", () => {
  it("incluye histórico revoked/excluded (a diferencia de la vista activa)", async () => {
    const client = fakeClient([row({ id: "a", status: "identified" }), row({ id: "b", status: "revoked" })]);
    const result = await listIdentificationsForClient(client as never, WS, CLIENT);
    expect(result).toHaveLength(2);
  });
});

describe("insertIdentification", () => {
  it("crea una identificación con confirmed_at derivado server-side", async () => {
    const client = fakeClient([]);
    const result = await insertIdentification(client as never, {
      workspaceId: WS,
      movementId: MOV,
      clientCompanyId: CLIENT,
      payerIdentityId: null,
      status: "identified",
      identificationMode: "manual_batch",
      reason: "Coincidencia fuerte por razón social",
      confirmedBy: ACTOR,
    });
    expect(result.clientCompanyId).toBe(CLIENT);
    expect(result.identificationMode).toBe("manual_batch");
    expect((client._inserted() as Row).confirmed_at).toBeTruthy();
  });

  it("propaga el error de conflicto (índice único activo) sin ocultarlo", async () => {
    const client = fakeClient([], { insertError: { message: "duplicate key value violates unique constraint" } });
    await expect(
      insertIdentification(client as never, {
        workspaceId: WS,
        movementId: MOV,
        clientCompanyId: CLIENT,
        payerIdentityId: null,
        status: "identified",
        identificationMode: "manual_single",
        reason: null,
        confirmedBy: ACTOR,
      })
    ).rejects.toThrow("CLIENT_IDENTIFICATION_INSERT_FAILED");
  });
});

describe("revokeIdentification", () => {
  it("marca revoked + revoked_at, nunca borra la fila", async () => {
    const client = fakeClient([row()]);
    await expect(revokeIdentification(client as never, WS, "id-1")).resolves.toBeUndefined();
  });

  it("propaga errores de la base", async () => {
    const client = fakeClient([row()], { updateError: { message: "boom" } });
    await expect(revokeIdentification(client as never, WS, "id-1")).rejects.toThrow(
      "CLIENT_IDENTIFICATION_REVOKE_FAILED"
    );
  });
});
