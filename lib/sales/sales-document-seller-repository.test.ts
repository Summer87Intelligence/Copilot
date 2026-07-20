/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — repositorio de asignación
 * MANUAL de vendedor por documento. Cubre: asignar, reasignar, desasignar,
 * idempotencia, notas de crédito rechazadas, vendedor inactivo rechazado,
 * documento/vendedor fuera del workspace, tabla ausente (migración pendiente),
 * y que la auditoría best-effort nunca bloquea la asignación real.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assignDocumentSeller } from "@/lib/sales/sales-document-seller-repository";

const WS = "ws-1";
const DOC = "doc-1";
const DANIEL = "daniel-id";
const CAMILA = "camila-id";
const USER = "user-1";

type Resp = { data?: unknown; error?: unknown };

/**
 * Mock Supabase por TABLA (no por cola global): cada `.from(table)` resuelve
 * contra su propia cola de respuestas, en el orden en que el repo las pide.
 */
function makeSupabase(tableQueues: Record<string, Resp[]>) {
  const queues: Record<string, Resp[]> = Object.fromEntries(
    Object.entries(tableQueues).map(([k, v]) => [k, [...v]])
  );
  const calls: Record<string, { method: string; payload?: unknown }[]> = {};

  function builderFor(table: string) {
    calls[table] ??= [];
    const next = (): Resp => {
      const q = queues[table] ?? [];
      return q.length ? q.shift()! : { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      upsert: (payload: Record<string, unknown>) => {
        calls[table]!.push({ method: "upsert", payload });
        return builder;
      },
      delete: () => {
        calls[table]!.push({ method: "delete" });
        return builder;
      },
      insert: (payload: Record<string, unknown>) => {
        calls[table]!.push({ method: "insert", payload });
        return builder;
      },
      maybeSingle: () => Promise.resolve(next()),
      then: (resolve: (v: Resp) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(next()).then(resolve, reject),
    };
    return builder;
  }

  const client = { from: (table: string) => builderFor(table) } as unknown as SupabaseClient;
  return { client, calls };
}

describe("assignDocumentSeller", () => {
  it("asigna Daniel a una factura (Sin vendedor → Daniel)", async () => {
    const { client, calls } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: { id: DANIEL, active: true } }],
      sales_document_salespersons: [{ data: null }], // sin fila actual
      sales_document_salesperson_audit: [{ error: null }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    expect(res).toMatchObject({ ok: true, sellerId: DANIEL, changed: true });
    expect(calls.sales_document_salespersons?.[0]).toMatchObject({
      method: "upsert",
      payload: { workspace_id: WS, document_id: DOC, salesperson_id: DANIEL },
    });
  });

  it("reasigna Camila sobre una factura que ya tenía a Daniel", async () => {
    const { client, calls } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: { id: CAMILA, active: true } }],
      sales_document_salespersons: [{ data: { id: "row-1", salesperson_id: DANIEL } }],
      sales_document_salesperson_audit: [{ error: null }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: CAMILA });
    expect(res).toMatchObject({ ok: true, sellerId: CAMILA, changed: true });
    expect(calls.sales_document_salespersons?.[0]?.method).toBe("upsert");
  });

  it("desasigna (sellerId=null) → borra la fila, queda Sin vendedor identificado", async () => {
    const { client, calls } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_document_salespersons: [{ data: { id: "row-1", salesperson_id: DANIEL } }],
      sales_document_salesperson_audit: [{ error: null }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: null });
    expect(res).toMatchObject({ ok: true, sellerId: null, changed: true });
    expect(calls.sales_document_salespersons?.[0]?.method).toBe("delete");
  });

  it("idempotencia: asignar el mismo vendedor dos veces no escribe nada la segunda vez", async () => {
    const { client, calls } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: { id: DANIEL, active: true } }],
      sales_document_salespersons: [{ data: { id: "row-1", salesperson_id: DANIEL } }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    expect(res).toMatchObject({ ok: true, sellerId: DANIEL, changed: false });
    expect(calls.sales_document_salespersons ?? []).toHaveLength(0);
    expect(calls.sales_document_salesperson_audit ?? []).toHaveLength(0);
  });

  it("nota de crédito → CREDIT_NOTE_NOT_ALLOWED, nunca escribe", async () => {
    const { client, calls } = makeSupabase({
      proto_invoices: [
        { data: { id: DOC, zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: "102" } } } },
      ],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    expect(res).toMatchObject({ ok: false, code: "CREDIT_NOTE_NOT_ALLOWED" });
    expect(calls.sales_document_salespersons ?? []).toHaveLength(0);
  });

  it("documento inexistente en el workspace → NOT_FOUND", async () => {
    const { client } = makeSupabase({
      proto_invoices: [{ data: null }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("vendedor inexistente en el workspace → NOT_FOUND", async () => {
    const { client } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: null }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: "ghost" });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("vendedor inactivo → INACTIVE_SELLER, no permite asignar", async () => {
    const { client } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: { id: DANIEL, active: false } }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    expect(res).toMatchObject({ ok: false, code: "INACTIVE_SELLER" });
  });

  it("tabla de asignación ausente (42P01) → MIGRATION_PENDING", async () => {
    const { client } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: { id: DANIEL, active: true } }],
      sales_document_salespersons: [{ data: null, error: { code: "42P01", message: "missing" } }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    expect(res).toMatchObject({ ok: false, code: "MIGRATION_PENDING" });
  });

  it("auditoría ausente (migración de auditoría no aplicada) no bloquea la asignación real", async () => {
    const { client, calls } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: { id: DANIEL, active: true } }],
      sales_document_salespersons: [{ data: null }],
      sales_document_salesperson_audit: [{ data: null, error: { code: "42P01", message: "missing" } }],
    });
    const res = await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    expect(res).toMatchObject({ ok: true, sellerId: DANIEL, changed: true });
    expect(calls.sales_document_salespersons?.[0]?.method).toBe("upsert");
  });

  it("no toca montos ni el comprobante: nunca llama sales-related tablas financieras", async () => {
    const { client, calls } = makeSupabase({
      proto_invoices: [{ data: { id: DOC, zeta_metadata: {} } }],
      sales_salespersons: [{ data: { id: DANIEL, active: true } }],
      sales_document_salespersons: [{ data: null }],
      sales_document_salesperson_audit: [{ error: null }],
    });
    await assignDocumentSeller(client, WS, USER, { documentId: DOC, sellerId: DANIEL });
    // Solo se tocaron las tablas de vendedor/documento/auditoría — nunca `proto_invoices` con insert/update.
    expect(calls.proto_invoices ?? []).toHaveLength(0);
  });
});
