import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createReconciliationLink,
  archiveReconciliationLink,
  listReconciliationLinksByMovement,
  getMovementReconciliationView,
} from "@/lib/bank-movements/bank-reconciliation-links-repository";

type Resp = { data: unknown; error: unknown };

/**
 * Fake Supabase basado en una cola de respuestas en orden de terminación
 * (`await` / `.maybeSingle()` / `.single()`). Registra los `insert` recibidos.
 */
function makeSupabase(responses: Resp[]) {
  const queue = [...responses];
  const inserts: Record<string, unknown>[] = [];
  const next = (): Resp => (queue.length ? queue.shift()! : { data: null, error: null });
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (payload: Record<string, unknown>) => {
      inserts.push(payload);
      return builder;
    },
    update: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    lte: () => builder,
    maybeSingle: () => Promise.resolve(next()),
    single: () => Promise.resolve(next()),
    then: (resolve: (v: Resp) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject),
  };
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, inserts };
}

const WS = "ws-1";
const MOV = "mov-1";
const movementRow = { id: MOV, workspace_id: WS, amount: 1000, currency: "UYU", direction: "inflow" };

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    bank_movement_id: MOV,
    target_type: "receipt",
    target_id: "r1",
    applied_amount: 100,
    currency: "UYU",
    direction: "inflow",
    method: "manual",
    confidence: null,
    archived_at: null,
    ...overrides,
  };
}

describe("listReconciliationLinksByMovement", () => {
  it("mapea filas y no marca migración pendiente", async () => {
    const { client } = makeSupabase([{ data: [linkRow()], error: null }]);
    const res = await listReconciliationLinksByMovement(client, WS, MOV);
    expect(res.migrationPending).toBe(false);
    expect(res.links[0]!.appliedAmount).toBe(100);
  });

  it("degrada a migrationPending si la tabla no existe (42P01)", async () => {
    const { client } = makeSupabase([{ data: null, error: { code: "42P01", message: "missing" } }]);
    const res = await listReconciliationLinksByMovement(client, WS, MOV);
    expect(res).toEqual({ links: [], migrationPending: true });
  });
});

describe("createReconciliationLink", () => {
  it("crea una aplicación parcial y devuelve la vista con estado partial", async () => {
    const inserted = linkRow({ id: "l2", applied_amount: 400 });
    const { client, inserts } = makeSupabase([
      { data: movementRow, error: null }, // loadMovement
      { data: [], error: null }, // links existentes
      { data: inserted, error: null }, // insert
    ]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "receipt",
      targetId: "r1",
      appliedAmount: 400,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.view.status).toBe("partial");
      expect(res.view.remaining).toBe(600);
      expect(res.view.applied).toBe(400);
    }
    // workspace_id lo pone el server, nunca el cliente
    expect(inserts[0]!.workspace_id).toBe(WS);
    expect(inserts[0]!.created_by).toBe("user-1");
  });

  it("bloquea sobre-aplicación (OVER_APPLIED) sin insertar", async () => {
    const { client, inserts } = makeSupabase([
      { data: movementRow, error: null },
      { data: [linkRow({ applied_amount: 800 })], error: null },
    ]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "receipt",
      targetId: "r2",
      appliedAmount: 300,
    });
    expect(res).toMatchObject({ ok: false, code: "OVER_APPLIED" });
    expect(inserts).toHaveLength(0);
  });

  it("bloquea cruce de monedas (CROSS_CURRENCY)", async () => {
    const { client } = makeSupabase([
      { data: movementRow, error: null },
      { data: [], error: null },
    ]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "receipt",
      targetId: "r1",
      appliedAmount: 100,
      targetCurrency: "USD",
    });
    expect(res).toMatchObject({ ok: false, code: "CROSS_CURRENCY" });
  });

  it("bloquea cruce de dirección (CROSS_DIRECTION)", async () => {
    const { client } = makeSupabase([
      { data: movementRow, error: null },
      { data: [], error: null },
    ]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "receipt",
      targetId: "r1",
      appliedAmount: 100,
      targetDirection: "outflow",
    });
    expect(res).toMatchObject({ ok: false, code: "CROSS_DIRECTION" });
  });

  it("importe no positivo → INVALID_AMOUNT", async () => {
    const { client } = makeSupabase([
      { data: movementRow, error: null },
      { data: [], error: null },
    ]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "receipt",
      targetId: "r1",
      appliedAmount: 0,
    });
    expect(res).toMatchObject({ ok: false, code: "INVALID_AMOUNT" });
  });

  it("movimiento inexistente en el workspace → MOVEMENT_NOT_FOUND", async () => {
    const { client } = makeSupabase([{ data: null, error: null }]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "receipt",
      targetId: "r1",
      appliedAmount: 100,
    });
    expect(res).toMatchObject({ ok: false, code: "MOVEMENT_NOT_FOUND" });
  });

  it("índice único activo violado → DUPLICATE", async () => {
    const { client } = makeSupabase([
      { data: movementRow, error: null },
      { data: [], error: null },
      { data: null, error: { code: "23505", message: "dup" } },
    ]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "receipt",
      targetId: "r1",
      appliedAmount: 100,
    });
    expect(res).toMatchObject({ ok: false, code: "DUPLICATE" });
  });

  it("marca 'ignored' sin validar importe y deriva estado ignored", async () => {
    const ignoredRow = linkRow({ id: "li", target_type: "ignored", target_id: null, applied_amount: 1000 });
    const { client } = makeSupabase([
      { data: movementRow, error: null },
      { data: [], error: null },
      { data: ignoredRow, error: null },
    ]);
    const res = await createReconciliationLink(client, WS, "user-1", {
      movementId: MOV,
      targetType: "ignored",
      targetId: null,
      appliedAmount: 0,
      note: "No corresponde",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.view.status).toBe("ignored");
  });
});

describe("archiveReconciliationLink", () => {
  it("archiva (deshace) una relación activa", async () => {
    const { client } = makeSupabase([{ data: { id: "l1" }, error: null }]);
    const res = await archiveReconciliationLink(client, WS, "l1");
    expect(res).toEqual({ ok: true });
  });

  it("relación inexistente o ya archivada → NOT_FOUND", async () => {
    const { client } = makeSupabase([{ data: null, error: null }]);
    const res = await archiveReconciliationLink(client, WS, "l1");
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("getMovementReconciliationView", () => {
  it("resuelve estado reconciled cuando los links cubren el total", async () => {
    const { client } = makeSupabase([
      { data: movementRow, error: null },
      { data: [linkRow({ applied_amount: 600 }), linkRow({ id: "l2", target_id: "r2", applied_amount: 400 })], error: null },
    ]);
    const res = await getMovementReconciliationView(client, WS, MOV);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.view.status).toBe("reconciled");
      expect(res.view.remaining).toBe(0);
    }
  });
});
