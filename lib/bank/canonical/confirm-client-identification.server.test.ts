import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { confirmBatchClientIdentification, reassignClientIdentification } = await import(
  "@/lib/bank/canonical/confirm-client-identification.server"
);

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const CLIENT_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CLIENT_B = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

type Row = Record<string, unknown>;

function row(over: Partial<Row> = {}): Row {
  return {
    id: `id-${Math.random().toString(36).slice(2, 8)}`,
    workspace_id: WS,
    movement_id: "m1",
    client_company_id: CLIENT_A,
    payer_identity_id: null,
    status: "identified",
    identification_mode: "manual_single",
    reason: null,
    confirmed_by: ACTOR,
    confirmed_at: "2026-07-21T00:00:00Z",
    revoked_by: null,
    revoked_at: null,
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
    ...over,
  };
}

type MovementFixture = { direction: "inflow" | "outflow"; hasFinancialLink?: boolean };

/**
 * Conoce bank_movement_client_identifications (lectura/escritura real) +
 * bank_movements/bank_movement_reconciliation_links (solo lectura, para los
 * guards de dirección/ya-conciliado). Cualquier OTRA tabla lanza, probando
 * que el servicio nunca escribe en payment_allocations/reconciliation_events.
 */
function fakeClient(initialRows: Row[], movements: Record<string, MovementFixture> = {}) {
  const rows = [...initialRows];
  const allMovements: Record<string, MovementFixture> = {
    m1: { direction: "inflow" },
    m2: { direction: "inflow" },
    m3: { direction: "inflow" },
    ...movements,
  };
  return {
    from(table: string) {
      if (table === "bank_movements") {
        const eqFilters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
          select() {
            return builder;
          },
          eq(col: string, val: unknown) {
            eqFilters[col] = val;
            return builder;
          },
          maybeSingle() {
            const id = eqFilters.id as string;
            const fixture = allMovements[id];
            return Promise.resolve({
              data: fixture ? { id, direction: fixture.direction } : null,
              error: null,
            });
          },
        };
        return builder;
      }
      if (table === "bank_movement_reconciliation_links") {
        const eqFilters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
          select() {
            return builder;
          },
          eq(col: string, val: unknown) {
            eqFilters[col] = val;
            return builder;
          },
          is() {
            return builder;
          },
          maybeSingle() {
            const id = eqFilters.bank_movement_id as string;
            const fixture = allMovements[id];
            return Promise.resolve({ data: fixture?.hasFinancialLink ? { id: "link-1" } : null, error: null });
          },
        };
        return builder;
      }
      if (table !== "bank_movement_client_identifications") {
        throw new Error(`UNEXPECTED_TABLE_WRITE: ${table}`);
      }
      const eqFilters: Record<string, unknown> = {};
      let excludeStatuses = false;
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          eqFilters[col] = val;
          return builder;
        },
        not() {
          excludeStatuses = true;
          return builder;
        },
        maybeSingle() {
          let out = rows;
          for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
          if (excludeStatuses) out = out.filter((r) => r.status !== "excluded" && r.status !== "revoked");
          return Promise.resolve({ data: out[0] ?? null, error: null });
        },
        insert(payload: Row) {
          const created = { id: `new-${rows.length}`, ...payload };
          rows.push(created);
          return {
            select() {
              return this;
            },
            single() {
              return Promise.resolve({ data: created, error: null });
            },
          };
        },
        update(payload: Row) {
          return {
            eq(col: string, val: unknown) {
              const target = rows.find((r) => r[col] === val);
              if (target) Object.assign(target, payload);
              return this;
            },
            then(resolve: (v: { error: null }) => void) {
              return resolve({ error: null });
            },
          };
        },
      };
      return builder;
    },
    _rows: () => rows,
  };
}

describe("confirmBatchClientIdentification", () => {
  it("crea identificaciones nuevas para todos los movimientos del lote", async () => {
    const client = fakeClient([]);
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1", "m2", "m3"],
      reason: "Coincidencia fuerte, razón social exacta",
    });
    expect(result.created).toHaveLength(3);
    expect(result.created.every((r) => r.identificationMode === "manual_batch")).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.alreadyIdentifiedSameClient).toEqual([]);
  });

  it("es idempotente: un movimiento ya identificado para el MISMO cliente no se re-crea", async () => {
    const client = fakeClient([row({ movement_id: "m1", client_company_id: CLIENT_A })]);
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1", "m2"],
      reason: null,
    });
    expect(result.alreadyIdentifiedSameClient).toEqual(["m1"]);
    expect(result.created.map((r) => r.movementId)).toEqual(["m2"]);
  });

  it("conflicto: un movimiento ya identificado para OTRO cliente no se sobrescribe", async () => {
    const client = fakeClient([row({ movement_id: "m1", client_company_id: CLIENT_B })]);
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1"],
      reason: null,
    });
    expect(result.conflicts).toEqual([{ movementId: "m1", existingClientCompanyId: CLIENT_B }]);
    expect(result.created).toEqual([]);
    // La fila original sigue intacta — nunca se tocó.
    expect(client._rows().find((r) => r.movement_id === "m1")!.client_company_id).toBe(CLIENT_B);
  });

  it("confirmación en lote con exclusiones: los movimientos excluidos por el operador ni siquiera se pasan", async () => {
    const client = fakeClient([]);
    // El caller (API/UI) filtra las exclusiones antes de llamar — se prueba
    // pasando solo el subconjunto no excluido.
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1", "m3"], // m2 fue excluido por el operador antes de llamar
      reason: null,
    });
    expect(result.created.map((r) => r.movementId).sort()).toEqual(["m1", "m3"]);
  });

  it("cuenta compartida / pago de tercero: status distinto de 'identified'", async () => {
    const client = fakeClient([]);
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1"],
      reason: "Pagador identificado como cuenta compartida entre dos clientes",
      status: "shared_account",
    });
    expect(result.created[0]!.status).toBe("shared_account");
  });

  it("nunca escribe en tablas financieras (bank_movement_reconciliation_links, payment_allocations, reconciliation_events)", async () => {
    const client = fakeClient([]);
    await expect(
      confirmBatchClientIdentification(client as never, {
        workspaceId: WS,
        actorUserId: ACTOR,
        clientCompanyId: CLIENT_A,
        movementIds: ["m1"],
        reason: null,
      })
    ).resolves.toBeDefined();
    // Si el servicio hubiera intentado tocar otra tabla, fakeClient.from()
    // habría lanzado UNEXPECTED_TABLE_WRITE y el test de arriba ya habría fallado.
  });

  it("bloquea movimientos de salida (egreso) — la identificación de cliente solo aplica a ingresos", async () => {
    const client = fakeClient([], { m1: { direction: "outflow" } });
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1"],
      reason: null,
    });
    expect(result.blockedNonInflow).toEqual(["m1"]);
    expect(result.created).toEqual([]);
  });

  it("movimiento ya conciliado financieramente: no crea una identificación redundante", async () => {
    const client = fakeClient([], { m1: { direction: "inflow", hasFinancialLink: true } });
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1"],
      reason: null,
    });
    expect(result.alreadyReconciled).toEqual(["m1"]);
    expect(result.created).toEqual([]);
  });

  it("fallo parcial en lote: los movimientos válidos se informan junto a los bloqueados, nunca a medias sin informar", async () => {
    const client = fakeClient([row({ movement_id: "m2", client_company_id: CLIENT_B })], {
      m1: { direction: "inflow" },
      m2: { direction: "inflow" },
      m3: { direction: "outflow" },
    });
    const result = await confirmBatchClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      clientCompanyId: CLIENT_A,
      movementIds: ["m1", "m2", "m3"],
      reason: null,
    });
    expect(result.created.map((r) => r.movementId)).toEqual(["m1"]);
    expect(result.conflicts).toEqual([{ movementId: "m2", existingClientCompanyId: CLIENT_B }]);
    expect(result.blockedNonInflow).toEqual(["m3"]);
  });
});

describe("reassignClientIdentification", () => {
  it("revoca la identificación anterior (no la borra) y crea una nueva para el cliente elegido", async () => {
    const client = fakeClient([row({ movement_id: "m1", client_company_id: CLIENT_A })]);
    const result = await reassignClientIdentification(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      movementId: "m1",
      newClientCompanyId: CLIENT_B,
      reason: "Corrección: era de otro cliente",
    });
    expect(result.created.clientCompanyId).toBe(CLIENT_B);
    const revokedRow = client._rows().find((r) => r.id === result.revokedId)!;
    expect(revokedRow.status).toBe("revoked");
    expect(revokedRow.revoked_by).toBe(ACTOR);
    expect(revokedRow.revoked_at).toBeTruthy();
    // La fila vieja sigue existiendo (histórico), no se eliminó.
    expect(client._rows()).toHaveLength(2);
  });

  it("falla explícitamente si no hay identificación activa para reasignar", async () => {
    const client = fakeClient([]);
    await expect(
      reassignClientIdentification(client as never, {
        workspaceId: WS,
        actorUserId: ACTOR,
        movementId: "m1",
        newClientCompanyId: CLIENT_B,
        reason: "Corrección: cliente equivocado",
      })
    ).rejects.toThrow("NO_ACTIVE_IDENTIFICATION_TO_REASSIGN");
  });

  it("exige motivo no vacío — una reasignación nunca es silenciosa", async () => {
    const client = fakeClient([row({ movement_id: "m1", client_company_id: CLIENT_A })]);
    await expect(
      reassignClientIdentification(client as never, {
        workspaceId: WS,
        actorUserId: ACTOR,
        movementId: "m1",
        newClientCompanyId: CLIENT_B,
        reason: "   ",
      })
    ).rejects.toThrow("REASSIGN_REASON_REQUIRED");
  });
});
