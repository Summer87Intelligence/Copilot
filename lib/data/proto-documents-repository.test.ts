import { describe, expect, it } from "vitest";

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import {
  getDocumentById,
  getDocumentsByRelatedTable,
} from "@/lib/data/proto-documents-repository";

type EqRecord = [string, unknown];

/** Cadena mínima compatible con el repositorio (thenable en `limit` / `maybeSingle`). */
function createStubOperationalSupabase(eqLog: EqRecord[]): OperationalSupabase {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      eqLog.push([col, val]);
      return chain;
    },
    order: () => chain,
    limit: () => Promise.resolve({ data: [] as unknown[], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    from: (table: string) => {
      eqLog.push(["__from", table]);
      return chain;
    },
  } as unknown as OperationalSupabase;
}

describe("proto-documents-repository — aislamiento workspace_company_id", () => {
  it("getDocumentsByRelatedTable aplica eq workspace_company_id cuando se pasa tenant", async () => {
    const eqLog: EqRecord[] = [];
    const client = createStubOperationalSupabase(eqLog);
    await getDocumentsByRelatedTable(client, "proto_tax_obligations", "ws-tenant-1");

    const hasWorkspace = eqLog.some(
      ([c, v]) => c === "workspace_company_id" && v === "ws-tenant-1"
    );
    expect(hasWorkspace).toBe(true);
    expect(eqLog.some(([c]) => c === "__from")).toBe(true);
    expect(eqLog.some(([c, v]) => c === "related_table" && v === "proto_tax_obligations")).toBe(
      true
    );
    expect(eqLog.some(([c, v]) => c === "is_active" && v === true)).toBe(true);
  });

  it("getDocumentsByRelatedTable no aplica workspace_company_id si el tenant no se pasa", async () => {
    const eqLog: EqRecord[] = [];
    const client = createStubOperationalSupabase(eqLog);
    await getDocumentsByRelatedTable(client, "proto_tax_obligations");

    expect(eqLog.some(([c]) => c === "workspace_company_id")).toBe(false);
  });

  it("getDocumentById encadena workspace_company_id antes de maybeSingle", async () => {
    const eqLog: EqRecord[] = [];
    const client = createStubOperationalSupabase(eqLog);
    await getDocumentById(client, "doc-uuid", "ws-tenant-2");

    expect(eqLog.some(([c, v]) => c === "id" && v === "doc-uuid")).toBe(true);
    expect(eqLog.some(([c, v]) => c === "workspace_company_id" && v === "ws-tenant-2")).toBe(
      true
    );
  });
});
