import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildCustomerSalesSummary } from "@/lib/sales/canonical/sales-aggregations";
import type { CanonicalSaleDocument } from "@/lib/sales/canonical/types";
import {
  assignClientSalesperson,
  upsertClientSalespersonAssignment,
} from "@/lib/sales/sales-client-salesperson-repository";

// ── Doc factory mínima ──────────────────────────────────────────────────────
function doc(
  p: Partial<CanonicalSaleDocument> &
    Pick<CanonicalSaleDocument, "documentId" | "kind" | "currency" | "grossAmount" | "issueDate">
): CanonicalSaleDocument {
  return {
    workspaceId: "ws",
    documentId: p.documentId,
    externalId: null,
    kind: p.kind,
    documentType: p.kind === "credit_note" ? "NC" : "e-Factura",
    cfeTipo: p.kind === "credit_note" ? 102 : 101,
    documentNumber: "1",
    customerId: p.customerId ?? "c1",
    customerCode: "C1",
    customerName: p.customerName ?? "Cliente QA",
    issueDate: p.issueDate,
    dueDate: null,
    currency: p.currency,
    grossAmount: p.grossAmount,
    appliedAmount: 0,
    registeredAmount: 0,
    pendingAmount: p.grossAmount,
    status: p.status ?? "valid",
    salespersonId: p.salespersonId ?? null,
    salespersonName: p.salespersonName ?? null,
    sellerId: p.sellerId ?? null,
    sellerName: p.sellerName ?? null,
    lines: p.lines ?? [
      {
        lineId: `${p.documentId}-l1`,
        documentId: p.documentId,
        originalCode: null,
        originalDescription: "Servicio QA",
        originalConcept: "Servicio QA",
        canonicalProductId: null,
        canonicalProductName: null,
        canonicalCategoryId: null,
        canonicalCategoryName: null,
        displayProductName: "Servicio QA",
        productGroupKey: "svc:qa",
        normalizationStatus: "original",
        classificationStatus: "unclassified",
        classificationSource: "zeta_concept",
        quantity: 1,
        unitPrice: p.grossAmount,
        lineAmount: p.grossAmount,
        netAmount: null,
        taxAmount: null,
        currency: p.currency,
        synthetic: false,
      },
    ],
  };
}

describe("buildCustomerSalesSummary — comercial vigente (fix hotfix)", () => {
  it("expone currentSalespersonId del cliente independiente de la atribución del período", () => {
    // Venta del período SIN atribución (salespersonId null: sale previa a la asignación).
    const docs = [doc({ documentId: "d1", kind: "sale", currency: "UYU", grossAmount: 1000, issueDate: "2026-06-10", salespersonId: null })];
    const rows = buildCustomerSalesSummary(docs, "2026-06-01", "2026-06-30", {
      currentSalespersonByCustomerId: new Map([["c1", "camila"]]),
      salespersonNameById: new Map([["camila", "Camila"]]),
    });
    const c1 = rows.find((r) => r.customerId === "c1")!;
    expect(c1.salespersonId).toBeNull(); // atribución del período: sin comercial
    expect(c1.currentSalespersonId).toBe("camila"); // comercial vigente actual: sí
    expect(c1.currentSalespersonName).toBe("Camila");
  });

  it("currentSalespersonId es null si el cliente no tiene asignación abierta", () => {
    const docs = [doc({ documentId: "d1", kind: "sale", currency: "UYU", grossAmount: 500, issueDate: "2026-06-10" })];
    const rows = buildCustomerSalesSummary(docs, "2026-06-01", "2026-06-30", {
      currentSalespersonByCustomerId: new Map(),
      salespersonNameById: new Map(),
    });
    expect(rows.find((r) => r.customerId === "c1")!.currentSalespersonId).toBeNull();
  });
});

// ── Mock Supabase basado en cola de respuestas (en orden de await) ────────────
type Resp = { data?: unknown; error?: unknown };
function makeSupabase(responses: Resp[]) {
  const queue = [...responses];
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const next = (): Resp => (queue.length ? queue.shift()! : { data: null, error: null });
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (payload: Record<string, unknown>) => {
      inserts.push(payload);
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      updates.push(payload);
      return builder;
    },
    eq: () => builder,
    is: () => builder,
    then: (resolve: (v: Resp) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject),
  };
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, inserts, updates };
}

const WS = "ws-1";
const CUST = "c1";

describe("upsertClientSalespersonAssignment (fix hotfix)", () => {
  it("CASO A: cliente sin comercial → crea una asignación abierta", async () => {
    const { client, inserts, updates } = makeSupabase([
      { data: [], error: null }, // open rows: ninguna
      { error: null }, // insert
    ]);
    const res = await upsertClientSalespersonAssignment(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res.ok).toBe(true);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ workspace_id: WS, customer_id: CUST, salesperson_id: "camila", valid_to: null });
  });

  it("CASO B: cambio A→B cierra A e inserta B (una sola activa, historial preservado)", async () => {
    const { client, inserts, updates } = makeSupabase([
      { data: [{ id: "openA", valid_from: "2026-07-01", salesperson_id: "daniel" }], error: null },
      { error: null }, // close A
      { error: null }, // insert B
    ]);
    const res = await upsertClientSalespersonAssignment(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res.ok).toBe(true);
    expect(updates).toHaveLength(1); // A cerrada (no borrada → historial)
    expect(updates[0]).toHaveProperty("valid_to");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ salesperson_id: "camila", valid_to: null });
  });

  it("IDEMPOTENCIA A→A: no cierra ni inserta nada", async () => {
    const { client, inserts, updates } = makeSupabase([
      { data: [{ id: "openA", valid_from: "2026-07-01", salesperson_id: "camila" }], error: null },
    ]);
    const res = await upsertClientSalespersonAssignment(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res.ok).toBe(true);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("des-asignar: cierra la abierta y no inserta", async () => {
    const { client, inserts, updates } = makeSupabase([
      { data: [{ id: "openA", valid_from: "2026-07-01", salesperson_id: "camila" }], error: null },
      { error: null }, // close
    ]);
    const res = await upsertClientSalespersonAssignment(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: null,
      validFrom: "2026-07-17",
    });
    expect(res.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });

  it("valida rango: validFrom previo al inicio de asignación → OUT_OF_RANGE", async () => {
    const { client } = makeSupabase([]);
    const res = await upsertClientSalespersonAssignment(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-06-01",
    });
    expect(res).toMatchObject({ ok: false, code: "OUT_OF_RANGE" });
  });

  it("tabla ausente (42P01) → MIGRATION_PENDING", async () => {
    const { client } = makeSupabase([{ data: null, error: { code: "42P01", message: "missing" } }]);
    const res = await upsertClientSalespersonAssignment(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res).toMatchObject({ ok: false, code: "MIGRATION_PENDING" });
  });
});

// ── Mock Supabase con rpc (para el wrapper atómico) + cola de from() para fallback ──
function makeSupabaseWithRpc(opts: { rpc?: Resp; fromQueue?: Resp[] } = {}) {
  const rpcCalls: { name: string; params: unknown }[] = [];
  const fromQueue = [...(opts.fromQueue ?? [])];
  const fromInserts: Record<string, unknown>[] = [];
  const fromUpdates: Record<string, unknown>[] = [];
  const nextFrom = (): Resp => (fromQueue.length ? fromQueue.shift()! : { data: null, error: null });
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (p: Record<string, unknown>) => {
      fromInserts.push(p);
      return builder;
    },
    update: (p: Record<string, unknown>) => {
      fromUpdates.push(p);
      return builder;
    },
    eq: () => builder,
    is: () => builder,
    then: (resolve: (v: Resp) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextFrom()).then(resolve, reject),
  };
  const client = {
    from: () => builder,
    rpc: (name: string, params: unknown) => {
      rpcCalls.push({ name, params });
      return Promise.resolve(opts.rpc ?? { data: null, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, rpcCalls, fromInserts, fromUpdates };
}

describe("assignClientSalesperson — wrapper ATÓMICO (RPC-first)", () => {
  it("usa el RPC transaccional y reporta atomic=true", async () => {
    const { client, rpcCalls, fromInserts, fromUpdates } = makeSupabaseWithRpc({ rpc: { data: {}, error: null } });
    const res = await assignClientSalesperson(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res).toEqual({ ok: true, atomic: true });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      name: "copilot_assign_client_salesperson",
      params: { p_workspace_id: WS, p_customer_id: CUST, p_salesperson_id: "camila", p_valid_from: "2026-07-17", p_assigned_by: "user-1" },
    });
    // No hubo escrituras secuenciales (todo lo hizo el RPC en una transacción).
    expect(fromInserts).toHaveLength(0);
    expect(fromUpdates).toHaveLength(0);
  });

  it("rollback: si el RPC falla al crear B, NO deja estado parcial ni cae al camino secuencial", async () => {
    // Un error de aplicación desde el RPC = la transacción entera hizo ROLLBACK en Postgres.
    const { client, rpcCalls, fromInserts, fromUpdates } = makeSupabaseWithRpc({
      rpc: { data: null, error: { code: "P0001", message: "SALESPERSON_NOT_FOUND" } },
    });
    const res = await assignClientSalesperson(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "ghost",
      validFrom: "2026-07-17",
    });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(rpcCalls).toHaveLength(1);
    expect(fromInserts).toHaveLength(0); // sin fallback → sin INSERT parcial
    expect(fromUpdates).toHaveLength(0); // sin UPDATE parcial (A intacta)
  });

  it("mapea CUSTOMER_NOT_FOUND del RPC → 404 NOT_FOUND", async () => {
    const { client } = makeSupabaseWithRpc({ rpc: { data: null, error: { message: "CUSTOMER_NOT_FOUND" } } });
    const res = await assignClientSalesperson(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("si el RPC no está aplicado (42883), degrada al camino secuencial (atomic=false)", async () => {
    const { client, fromInserts } = makeSupabaseWithRpc({
      rpc: { data: null, error: { code: "42883", message: "function does not exist" } },
      fromQueue: [{ data: [], error: null }, { error: null }], // open vacío + insert
    });
    const res = await assignClientSalesperson(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res).toEqual({ ok: true, atomic: false });
    expect(fromInserts).toHaveLength(1); // el fallback secuencial insertó
  });

  it("NO_WORKSPACE del RPC (service_role sin auth.uid / firma vieja) → degrada al secuencial", async () => {
    // Reproduce el 500 de producción: la v1 derivaba workspace de la sesión y fallaba
    // bajo service_role. El wrapper ahora degrada en vez de devolver DB_ERROR/500.
    const { client, fromInserts } = makeSupabaseWithRpc({
      rpc: { data: null, error: { code: "P0001", message: "NO_WORKSPACE" } },
      fromQueue: [{ data: [], error: null }, { error: null }],
    });
    const res = await assignClientSalesperson(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-07-17",
    });
    expect(res).toEqual({ ok: true, atomic: false });
    expect(fromInserts).toHaveLength(1);
  });

  it("valida rango antes de tocar el RPC → OUT_OF_RANGE", async () => {
    const { client, rpcCalls } = makeSupabaseWithRpc({});
    const res = await assignClientSalesperson(client, WS, "user-1", {
      customerId: CUST,
      salespersonId: "camila",
      validFrom: "2026-06-01",
    });
    expect(res).toMatchObject({ ok: false, code: "OUT_OF_RANGE" });
    expect(rpcCalls).toHaveLength(0);
  });
});
