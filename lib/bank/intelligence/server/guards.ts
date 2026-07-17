/**
 * Guardas explícitas de la capa shadow: prohiben escrituras financieras y RPCs.
 */

import type { ShadowWriteTarget } from "@/lib/bank/intelligence/server/types";

export class ShadowGuardError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ShadowGuardError";
    this.code = code;
  }
}

export const FORBIDDEN_SHADOW_TABLES = [
  "bank_movement_reconciliation_links",
  "payment_allocations",
  "bank_movements",
  "proto_receipts",
  "proto_invoices",
  "bank_payer_identities",
  "client_payer_links",
] as const;

export const FORBIDDEN_SHADOW_RPCS = [
  "confirm_bank_reconciliation_v1",
  "reverse_bank_reconciliation_v1",
] as const;

export const ALLOWED_SHADOW_WRITE_TABLES = [
  "bank_reconciliation_suggestions",
  "reconciliation_events",
] as const satisfies readonly ShadowWriteTarget[];

export type ForbiddenShadowTable = (typeof FORBIDDEN_SHADOW_TABLES)[number];
export type ForbiddenShadowRpc = (typeof FORBIDDEN_SHADOW_RPCS)[number];

export function isForbiddenShadowTable(table: string): table is ForbiddenShadowTable {
  return (FORBIDDEN_SHADOW_TABLES as readonly string[]).includes(table);
}

export function isAllowedShadowWriteTable(table: string): table is ShadowWriteTarget {
  return (ALLOWED_SHADOW_WRITE_TABLES as readonly string[]).includes(table);
}

export function assertShadowWriteAllowed(
  table: string,
  operation: "insert" | "update" | "delete"
): asserts table is ShadowWriteTarget {
  if (isForbiddenShadowTable(table)) {
    throw new ShadowGuardError(
      "SHADOW_FORBIDDEN_TABLE",
      `Shadow layer cannot ${operation} on forbidden table '${table}'.`
    );
  }
  if (!isAllowedShadowWriteTable(table)) {
    throw new ShadowGuardError(
      "SHADOW_WRITE_NOT_ALLOWED",
      `Shadow layer may only write suggestions/events; refused '${table}'.`
    );
  }
  if (table === "reconciliation_events" && operation !== "insert") {
    throw new ShadowGuardError(
      "SHADOW_EVENTS_APPEND_ONLY",
      "reconciliation_events is append-only; only insert is allowed."
    );
  }
  if (table === "bank_reconciliation_suggestions" && operation === "delete") {
    throw new ShadowGuardError(
      "SHADOW_NO_DELETE_SUGGESTIONS",
      "Shadow layer must not delete suggestions; use superseded status."
    );
  }
}

export function assertShadowRpcForbidden(rpcName: string): void {
  if ((FORBIDDEN_SHADOW_RPCS as readonly string[]).includes(rpcName)) {
    throw new ShadowGuardError(
      "SHADOW_FORBIDDEN_RPC",
      `Shadow layer must never call financial RPC '${rpcName}'.`
    );
  }
}

/** Wrapper que registra intentos de RPC y bloquea las financieras. */
export function createShadowRpcGuard() {
  const attempted: string[] = [];
  return {
    attempted,
    call(rpcName: string): never {
      attempted.push(rpcName);
      assertShadowRpcForbidden(rpcName);
      throw new ShadowGuardError(
        "SHADOW_RPC_DISABLED",
        `Shadow layer has no RPC surface; refused '${rpcName}'.`
      );
    },
  };
}
