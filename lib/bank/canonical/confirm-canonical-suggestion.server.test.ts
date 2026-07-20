import { describe, it, expect, vi } from "vitest";

import { confirmCanonicalSuggestion } from "@/lib/bank/canonical/confirm-canonical-suggestion.server";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeClient(tables: Tables, rpcImpl?: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const eqFilters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let gtCol: string | null = null;
      let gtVal: number | null = null;
      function apply(): Row[] {
        let out = rows;
        for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
        for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
        if (gtCol) out = out.filter((r) => Number(r[gtCol!]) > (gtVal as number));
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
        gt(col: string, val: number) {
          gtCol = col;
          gtVal = val;
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          const out = apply();
          return Promise.resolve({ data: out[0] ?? null, error: null });
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          return resolve({ data: apply(), error: null });
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (!rpcImpl) return Promise.resolve({ data: null, error: { message: "NO_RPC_CONFIGURED" } });
      return Promise.resolve(rpcImpl(name, args));
    },
  };
}

const baseSuggestion = {
  id: "sugg-1",
  workspace_id: WS,
  bank_movement_id: "mov-1",
  payer_identity_id: null,
  proposed_client_id: "client-1",
  proposed_receipt_id: "receipt-1",
  confidence: 92,
  reasons: [],
  warnings: [],
  recommended_action: "AUTO_RECONCILE_CANDIDATE",
  engine_version: 1,
  status: "generated",
  suggestion_scope: "operational",
  created_at: "2026-07-18T00:00:00Z",
  updated_at: "2026-07-18T00:00:00Z",
};

describe("confirmCanonicalSuggestion — capa server-side sobre confirm_bank_reconciliation_v1", () => {
  it("confirma sin asignaciones de factura (fast path, solo movimiento+recibo)", async () => {
    const rpc = vi.fn(() => ({ data: { linkId: "link-1", idempotent: false, status: "confirmed" }, error: null }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);

    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      expectedReceiptId: "receipt-1",
      invoiceAllocations: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.linkId).toBe("link-1");
      expect(result.data.idempotent).toBe(false);
    }
    expect(rpc).toHaveBeenCalledWith(
      "confirm_bank_reconciliation_v1",
      expect.objectContaining({
        p_workspace_id: WS,
        p_movement_id: "mov-1",
        p_receipt_id: "receipt-1",
        p_suggestion_id: "sugg-1",
        p_allocations: null,
        p_created_by: ACTOR,
      })
    );
  });

  it("rechaza si el movimiento enviado no coincide con el de la sugerencia (evidencia desalineada)", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] });
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-OTRO",
      expectedReceiptId: "receipt-1",
      invoiceAllocations: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MOVEMENT_MISMATCH");
  });

  it("rechaza si el recibo enviado no coincide con el propuesto por la sugerencia", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] });
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      expectedReceiptId: "receipt-OTRO",
      invoiceAllocations: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RECEIPT_MISMATCH");
  });

  it("nunca confirma una sugerencia fuera de scope operational (histórica/auditoría)", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [{ ...baseSuggestion, suggestion_scope: "historical_review" }],
    });
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      expectedReceiptId: "receipt-1",
      invoiceAllocations: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SUGGESTION_NOT_CONFIRMABLE");
  });

  it("rechaza si la sugerencia no existe en el workspace", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [] });
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-inexistente",
      expectedMovementId: "mov-1",
      expectedReceiptId: null,
      invoiceAllocations: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SUGGESTION_NOT_FOUND");
  });

  it("valida asignaciones de factura contra las facturas candidatas recalculadas (misma evidencia que el drawer)", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [baseSuggestion],
      proto_receipts: [{ id: "receipt-1", workspace_company_id: WS, currency_code: "UYU" }],
      proto_invoices: [
        { id: "inv-valida", workspace_company_id: WS, company_id: "client-1", currency_code: "UYU", balance_amount: 1000, issue_date: null, due_date: null, is_active: true },
      ],
    });
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      expectedReceiptId: "receipt-1",
      invoiceAllocations: [{ invoiceId: "inv-NO-CANDIDATA", amount: 500 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVOICE_NOT_IN_EVIDENCE");
  });

  it("permite asignaciones cuando la factura sí pertenece a la evidencia recalculada", async () => {
    const rpc = vi.fn(() => ({ data: { linkId: "link-2", idempotent: false, status: "confirmed" }, error: null }));
    const client = fakeClient(
      {
        bank_reconciliation_suggestions: [baseSuggestion],
        proto_receipts: [{ id: "receipt-1", workspace_company_id: WS, currency_code: "UYU" }],
        proto_invoices: [
          { id: "inv-valida", workspace_company_id: WS, company_id: "client-1", currency_code: "UYU", balance_amount: 1000, issue_date: null, due_date: null, is_active: true },
        ],
      },
      rpc
    );
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      expectedReceiptId: "receipt-1",
      invoiceAllocations: [{ invoiceId: "inv-valida", amount: 1000 }],
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "confirm_bank_reconciliation_v1",
      expect.objectContaining({
        p_allocations: [{ invoice_id: "inv-valida", amount: 1000 }],
      })
    );
  });

  it("traduce el código crudo de la RPC (p.ej. ALLOCATIONS_EXCEED_LINK) a un resultado con mensaje legible", async () => {
    const rpc = vi.fn(() => ({ data: null, error: { message: "ALLOCATIONS_EXCEED_LINK" } }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      expectedReceiptId: "receipt-1",
      invoiceAllocations: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ALLOCATIONS_EXCEED_LINK");
      expect(result.message).not.toBe("ALLOCATIONS_EXCEED_LINK");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("trata already_confirmed como éxito idempotente (reintento del mismo operador o doble click)", async () => {
    const rpc = vi.fn(() => ({ data: { linkId: "link-1", idempotent: true, status: "already_confirmed" }, error: null }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);
    const result = await confirmCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      expectedReceiptId: "receipt-1",
      invoiceAllocations: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.idempotent).toBe(true);
  });
});
