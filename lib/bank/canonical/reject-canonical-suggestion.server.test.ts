import { describe, it, expect, vi } from "vitest";

import { rejectCanonicalSuggestion } from "@/lib/bank/canonical/reject-canonical-suggestion.server";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeClient(tables: Tables, rpcImpl?: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
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
          const out = rows.filter((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v));
          return Promise.resolve({ data: out[0] ?? null, error: null });
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
  confidence: 60,
  reasons: [],
  warnings: [],
  recommended_action: "REVIEW",
  engine_version: 1,
  status: "generated",
  suggestion_scope: "operational",
  created_at: "2026-07-18T00:00:00Z",
  updated_at: "2026-07-18T00:00:00Z",
};

describe("rejectCanonicalSuggestion — capa server-side sobre reject_bank_suggestion_v1", () => {
  it("rechaza la sugerencia con un motivo válido y nunca toca bank_movements", async () => {
    const rpc = vi.fn(() => ({ data: { status: "rejected" }, error: null }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);

    const result = await rejectCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      reason: "Cliente equivocado, el pagador es otra empresa",
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("reject_bank_suggestion_v1", {
      p_workspace_id: WS,
      p_suggestion_id: "sugg-1",
      p_actor: ACTOR,
      p_reason: "Cliente equivocado, el pagador es otra empresa",
    });
  });

  it("rechaza motivos demasiado cortos antes de llamar la RPC", async () => {
    const rpc = vi.fn();
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc as never);
    const result = await rejectCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      reason: "no",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REASON_INVALID");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("nunca permite rechazar una sugerencia fuera de scope operational desde esta capa", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [{ ...baseSuggestion, suggestion_scope: "historical_review" }],
    });
    const result = await rejectCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      reason: "motivo válido de sobra",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SCOPE_NOT_ALLOWED");
  });

  it("rechaza si el movimiento enviado no coincide con el de la sugerencia", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] });
    const result = await rejectCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-OTRO",
      reason: "motivo válido de sobra",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MOVEMENT_MISMATCH");
  });

  it("trata already_rejected como éxito idempotente", async () => {
    const rpc = vi.fn(() => ({ data: { status: "already_rejected" }, error: null }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);
    const result = await rejectCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      reason: "motivo válido de sobra",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.idempotent).toBe(true);
  });

  it("traduce SUGGESTION_TERMINAL a un mensaje legible", async () => {
    const rpc = vi.fn(() => ({ data: null, error: { message: "SUGGESTION_TERMINAL" } }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);
    const result = await rejectCanonicalSuggestion(client as never, {
      workspaceId: WS,
      actorUserId: ACTOR,
      suggestionId: "sugg-1",
      expectedMovementId: "mov-1",
      reason: "motivo válido de sobra",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SUGGESTION_TERMINAL");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
