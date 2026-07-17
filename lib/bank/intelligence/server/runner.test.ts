import { describe, expect, it, vi } from "vitest";

import {
  resolveShadowMode,
  resolveShadowScope,
  runBankShadowIntelligence,
  ShadowScopeError,
} from "@/lib/bank/intelligence/server/runner";
import { SHADOW_MAX_LIMIT } from "@/lib/bank/intelligence/server/types";
import type { ShadowPersistPorts } from "@/lib/bank/intelligence/server/shadow-persist-apply";
import type { ShadowSuggestionRow } from "@/lib/bank/intelligence/server/types";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function movementRow(id: string, workspaceId = WS) {
  return {
    id,
    workspace_id: workspaceId,
    bank_name: "Santander",
    account_label: "EASY 1",
    movement_date: "2026-07-08",
    description: "Pepito SA",
    raw_description: null,
    amount: 1000,
    currency: "UYU",
    direction: "inflow",
    bank_reference: "OP-1",
    status: "pending",
    metadata: null,
  };
}

/** Query builder mock: cualquier cadena termina en { data, error: null }. */
function createQueryBuilder(data: unknown = []) {
  const result = { data, error: null as null };
  const builder: Record<string, unknown> = {};
  const api = new Proxy(builder, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: typeof result) => void) => resolve(result);
      }
      if (prop === "maybeSingle" || prop === "single") {
        return async () => {
          const rows = Array.isArray(data) ? data : data ? [data] : [];
          return { data: rows[0] ?? null, error: null };
        };
      }
      return () => api;
    },
  });
  return api;
}

function createSupabaseMock(opts?: {
  movement?: ReturnType<typeof movementRow> | null;
  onWrite?: (table: string, op: string) => void;
}) {
  const movement = opts?.movement === undefined ? movementRow("m1") : opts.movement;
  const rpcCalls: string[] = [];

  const from = vi.fn((table: string) => {
    if (table === "bank_movements") {
      return createQueryBuilder(movement ? [movement] : []);
    }
    if (table === "bank_reconciliation_suggestions") {
      return createQueryBuilder([]);
    }
    // Intercept write attempts on forbidden tables
    const base = createQueryBuilder([]);
    return new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === "insert" || prop === "update" || prop === "delete") {
          return () => {
            opts?.onWrite?.(table, String(prop));
            return createQueryBuilder(null);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  });

  return {
    supabase: {
      from,
      rpc: (name: string) => {
        rpcCalls.push(name);
        throw new Error(`RPC ${name} must not be called`);
      },
    },
    rpcCalls,
  };
}

describe("runner — scope y modos", () => {
  it("exige scope explícito (no escanea 951)", () => {
    expect(() => resolveShadowScope({ workspaceId: WS })).toThrow(ShadowScopeError);
    expect(() => resolveShadowScope({ workspaceId: WS })).toThrow(/SHADOW_SCOPE_REQUIRED/);
  });

  it("acepta movementId, lista o limit pequeño", () => {
    expect(resolveShadowScope({ workspaceId: WS, movementId: "m1" })).toEqual({
      movementIds: ["m1"],
      limit: 1,
    });
    expect(
      resolveShadowScope({ workspaceId: WS, movementIds: ["m1", "m2"], limit: 10 })
    ).toEqual({ movementIds: ["m1", "m2"], limit: 2 });
    expect(resolveShadowScope({ workspaceId: WS, limit: 5 })).toEqual({
      movementIds: null,
      limit: 5,
    });
  });

  it("rechaza limit > MAX", () => {
    expect(() =>
      resolveShadowScope({ workspaceId: WS, limit: SHADOW_MAX_LIMIT + 1 })
    ).toThrow(/SHADOW_MAX_LIMIT/);
  });

  it("dryRun=true y persist=false por defecto", () => {
    expect(resolveShadowMode({ workspaceId: WS, limit: 1 })).toEqual({
      mode: "dry-run",
      writesEnabled: false,
    });
    expect(
      resolveShadowMode({ workspaceId: WS, limit: 1, dryRun: false, persist: false })
    ).toEqual({ mode: "dry-run", writesEnabled: false });
    expect(
      resolveShadowMode({ workspaceId: WS, limit: 1, dryRun: false, persist: true })
    ).toEqual({ mode: "shadow-persist", writesEnabled: true });
  });
});

describe("runner — integración mockeada", () => {
  it("dry-run no escribe nada", async () => {
    const tableWrites: string[] = [];
    const { supabase, rpcCalls } = createSupabaseMock({
      onWrite: (table, op) => tableWrites.push(`${table}:${op}`),
    });

    const persistPorts: ShadowPersistPorts = {
      async insertSuggestion() {
        tableWrites.push("port:insertSuggestion");
        throw new Error("should not write in dry-run");
      },
      async updateSuggestion() {
        tableWrites.push("port:updateSuggestion");
        throw new Error("should not write in dry-run");
      },
      async supersedeSuggestion() {
        tableWrites.push("port:supersede");
        throw new Error("should not write in dry-run");
      },
      async insertEvent() {
        tableWrites.push("port:insertEvent");
        throw new Error("should not write in dry-run");
      },
    };

    const result = await runBankShadowIntelligence(
      { supabase: supabase as never, persistPorts },
      { workspaceId: WS, movementId: "m1" }
    );

    expect(result.mode).toBe("dry-run");
    expect(result.writesEnabled).toBe(false);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.workspaceId).toBe(WS);
    expect(result.proposals[0]?.bankMovementId).toBe("m1");
    expect(result.proposals[0]?.recommendedAction).toBeTruthy();
    expect(result.persisted.created).toBe(0);
    expect(tableWrites.filter((w) => w.startsWith("port:"))).toEqual([]);
    expect(rpcCalls).toEqual([]);
    expect(tableWrites).not.toContain("payment_allocations:insert");
    expect(tableWrites).not.toContain("bank_movement_reconciliation_links:insert");
  });

  it("shadow persist solo usa ports de suggestion/events", async () => {
    const portWrites: string[] = [];
    const tableWrites: string[] = [];
    const { supabase, rpcCalls } = createSupabaseMock({
      onWrite: (table, op) => tableWrites.push(`${table}:${op}`),
    });

    const persistPorts: ShadowPersistPorts = {
      async insertSuggestion(p) {
        portWrites.push(`insertSuggestion:${p.bankMovementId}`);
        const row: ShadowSuggestionRow = {
          id: "sug-1",
          workspaceId: WS,
          bankMovementId: p.bankMovementId,
          payerIdentityId: p.payerIdentityId,
          proposedClientId: p.proposedClientId,
          proposedReceiptId: p.proposedReceiptId,
          confidence: p.confidence,
          reasons: p.reasons,
          warnings: p.warnings,
          recommendedAction: p.recommendedAction,
          engineVersion: p.engineVersion,
          status: "generated",
          confirmedLinkId: null,
          createdAt: p.generatedAt,
          updatedAt: p.generatedAt,
        };
        return row;
      },
      async updateSuggestion() {
        portWrites.push("updateSuggestion");
        throw new Error("unexpected update");
      },
      async supersedeSuggestion() {
        portWrites.push("supersede");
      },
      async insertEvent(e) {
        portWrites.push(`insertEvent:${e.eventType}`);
      },
    };

    const result = await runBankShadowIntelligence(
      { supabase: supabase as never, persistPorts },
      { workspaceId: WS, movementId: "m1", dryRun: false, persist: true }
    );

    expect(result.mode).toBe("shadow-persist");
    expect(result.writesEnabled).toBe(true);
    expect(result.proposals).toHaveLength(1);
    expect(rpcCalls).toEqual([]);
    expect(tableWrites.filter((w) => w.includes("payment_allocations"))).toEqual([]);
    expect(
      tableWrites.filter((w) => w.includes("bank_movement_reconciliation_links:insert"))
    ).toEqual([]);
    expect(
      tableWrites.filter((w) =>
        ["bank_movements:update", "proto_receipts:update", "proto_invoices:update"].includes(w)
      )
    ).toEqual([]);

    // O create+event, o skip por evidencia insuficiente — nunca RPC/links.
    if (result.persisted.created > 0) {
      expect(portWrites).toContain("insertSuggestion:m1");
      expect(portWrites.some((w) => w.startsWith("insertEvent:"))).toBe(true);
    } else {
      expect(result.persisted.insufficientEvidence + result.persisted.skipped).toBeGreaterThan(0);
    }
  });
});

describe("runner — política de movimientos matched", () => {
  function recordingPorts(portWrites: string[]): ShadowPersistPorts {
    return {
      async insertSuggestion(p) {
        portWrites.push(`insertSuggestion:${p.bankMovementId}`);
        throw new Error("audit-only/matched must not persist");
      },
      async updateSuggestion() {
        portWrites.push("updateSuggestion");
        throw new Error("must not update");
      },
      async supersedeSuggestion() {
        portWrites.push("supersede");
        throw new Error("must not supersede");
      },
      async insertEvent(e) {
        portWrites.push(`insertEvent:${e.eventType}`);
        throw new Error("audit-only/matched must not emit events");
      },
    };
  }

  it("matched con persist=true → skipped MOVEMENT_ALREADY_MATCHED, sin writes", async () => {
    const portWrites: string[] = [];
    const { supabase, rpcCalls } = createSupabaseMock({
      movement: { ...movementRow("m1"), status: "matched" },
    });

    const result = await runBankShadowIntelligence(
      { supabase: supabase as never, persistPorts: recordingPorts(portWrites) },
      { workspaceId: WS, movementId: "m1", dryRun: false, persist: true }
    );

    expect(result.proposals).toHaveLength(0);
    expect(result.skippedMovements).toEqual([
      { movementId: "m1", reason: "MOVEMENT_ALREADY_MATCHED" },
    ]);
    expect(result.persisted.created).toBe(0);
    expect(portWrites).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("includeMatchedForAudit=true + dry-run → audit-only, nunca AUTO, no persiste", async () => {
    const { supabase } = createSupabaseMock({
      movement: { ...movementRow("m1"), status: "matched" },
    });

    const result = await runBankShadowIntelligence(
      { supabase: supabase as never },
      { workspaceId: WS, movementId: "m1", includeMatchedForAudit: true }
    );

    expect(result.mode).toBe("dry-run");
    expect(result.proposals).toHaveLength(1);
    const p = result.proposals[0]!;
    expect(p.auditOnly).toBe(true);
    expect(p.warnings).toContain("MATCHED_MOVEMENT_AUDIT");
    expect(p.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
    expect(result.persisted.created).toBe(0);
  });

  it("audit-only con persist=true NO persiste (sin port writes)", async () => {
    const portWrites: string[] = [];
    const { supabase } = createSupabaseMock({
      movement: { ...movementRow("m1"), status: "matched" },
    });

    const result = await runBankShadowIntelligence(
      { supabase: supabase as never, persistPorts: recordingPorts(portWrites) },
      { workspaceId: WS, movementId: "m1", dryRun: false, persist: true, includeMatchedForAudit: true }
    );

    expect(result.proposals[0]?.auditOnly).toBe(true);
    expect(portWrites).toEqual([]);
    expect(result.persisted.created).toBe(0);
    expect(result.persisted.skipped).toBeGreaterThanOrEqual(1);
  });
});
