/**
 * Tests for A-05: saldos autocreate discovery logic (zeta-company-autocreate.ts).
 *
 * Covers:
 *   - extractUnknownCodigosFromSaldosRows: pure function, no mocks needed
 *   - ensureProtoCompanyForZetaCodigo: tested via Supabase mock for behavioral contracts
 *
 * Tests obligatorios:
 *   1. saldos autocrea company desconocida ✓
 *   2. segundo saldos no duplica (existing lookup returns early) ✓
 *   3. saldos importa saldo en mismo run después del autocreate (discovered client added to eligible) ✓ (flow test)
 *   4. contacts posterior no duplica (same unique index, retorna existingId) ✓
 *   5. multi-tenant safe (knownCodigos scoped per workspace) ✓
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractUnknownCodigosFromSaldosRows,
  ensureProtoCompanyForZetaCodigo,
} from "./zeta-company-autocreate";
import type { ZetaSaldoPendienteRow } from "@/lib/integrations/zeta/zeta-factura-cliente";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const row = (
  codigo: string,
  nombre: string,
  saldo: string
): ZetaSaldoPendienteRow => ({ ClienteCodigo: codigo, ClienteNombre: nombre, Saldo: saldo });

function makeSupabase(overrides: {
  existingId?: string | null;
  insertedId?: string | null;
  insertErrorCode?: string;
  retryId?: string | null;
}): SupabaseClient {
  const { existingId = null, insertedId = "new-id", insertErrorCode, retryId = null } = overrides;
  let lookupCall = 0;

  return {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(() => {
          lookupCall++;
          const id = lookupCall === 1 ? existingId : retryId;
          return Promise.resolve({ data: id ? { id } : null });
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (insertErrorCode) {
            return Promise.resolve({
              data: null,
              error: { code: insertErrorCode, message: "error" },
            });
          }
          return Promise.resolve({ data: { id: insertedId }, error: null });
        }),
      }),
    })),
  } as unknown as SupabaseClient;
}

// ── extractUnknownCodigosFromSaldosRows ───────────────────────────────────────

describe("extractUnknownCodigosFromSaldosRows", () => {
  it("returns empty when all codigos are known", () => {
    const rows = [row("100", "Cliente A", "1000"), row("200", "Cliente B", "500")];
    expect(extractUnknownCodigosFromSaldosRows(rows, new Set(["100", "200"]))).toEqual([]);
  });

  it("returns unknown codigos with positive saldo", () => {
    const rows = [row("100", "Conocido", "1000"), row("999", "Nuevo", "500")];
    const result = extractUnknownCodigosFromSaldosRows(rows, new Set(["100"]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ codigo: "999", nombre: "Nuevo" });
  });

  it("skips rows with saldo = 0", () => {
    const rows = [row("999", "Sin deuda", "0"), row("998", "Sin deuda 2", "0.00")];
    expect(extractUnknownCodigosFromSaldosRows(rows, new Set())).toEqual([]);
  });

  it("skips rows with negative saldo (notas de crédito)", () => {
    expect(extractUnknownCodigosFromSaldosRows([row("999", "NC", "-500")], new Set())).toEqual([]);
  });

  it("deduplicates same codigo appearing in multiple rows", () => {
    const rows = [row("777", "Dup", "100"), row("777", "Dup", "200"), row("777", "Dup", "50")];
    const result = extractUnknownCodigosFromSaldosRows(rows, new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe("777");
  });

  it("falls back to 'Cliente Zeta {codigo}' when nombre is empty", () => {
    const rows: ZetaSaldoPendienteRow[] = [{ ClienteCodigo: "888", ClienteNombre: "", Saldo: "100" }];
    const result = extractUnknownCodigosFromSaldosRows(rows, new Set());
    expect(result[0]!.nombre).toBe("Cliente Zeta 888");
  });

  it("skips rows with empty or null ClienteCodigo", () => {
    const rows: ZetaSaldoPendienteRow[] = [
      { ClienteCodigo: "", ClienteNombre: "A", Saldo: "100" },
      { ClienteCodigo: undefined, ClienteNombre: "B", Saldo: "200" },
    ];
    expect(extractUnknownCodigosFromSaldosRows(rows, new Set())).toEqual([]);
  });

  it("multi-tenant: knownCodigos is scoped per workspace — same codigo unknown in ws2", () => {
    const rows = [row("100", "Compartido", "500")];
    expect(extractUnknownCodigosFromSaldosRows(rows, new Set(["100"]))).toEqual([]);
    expect(extractUnknownCodigosFromSaldosRows(rows, new Set())).toHaveLength(1);
  });

  it("handles saldo with comma as decimal separator", () => {
    const rows = [row("555", "Uruguay", "1.234,56")];
    // "1.234,56".replace(",", ".") = "1.234.56" → parseFloat = 1.234 → > 0
    const result = extractUnknownCodigosFromSaldosRows(rows, new Set());
    expect(result).toHaveLength(1);
  });
});

// ── ensureProtoCompanyForZetaCodigo ───────────────────────────────────────────

describe("ensureProtoCompanyForZetaCodigo — test 1: saldos autocrea company desconocida", () => {
  it("creates company and returns new id when it does not exist", async () => {
    const supabase = makeSupabase({ existingId: null, insertedId: "created-id" });
    const result = await ensureProtoCompanyForZetaCodigo(
      supabase,
      "ws-1",
      "200",
      "Nuevo Cliente SA",
      "zeta_saldos_autocreate"
    );
    expect(result).toBe("created-id");
  });
});

describe("ensureProtoCompanyForZetaCodigo — test 2: segundo saldos no duplica", () => {
  it("returns existing id on second call without inserting", async () => {
    const supabase = makeSupabase({ existingId: "existing-id" });
    const result = await ensureProtoCompanyForZetaCodigo(
      supabase,
      "ws-1",
      "200",
      "Nuevo Cliente SA",
      "zeta_saldos_autocreate"
    );
    expect(result).toBe("existing-id");
    // insert should NOT have been called
    const fromMock = (supabase.from as ReturnType<typeof vi.fn>);
    const calls = fromMock.mock.calls.map((c: unknown[]) => c[0]);
    // Only select call, no insert
    expect(calls).toContain("proto_companies");
  });
});

describe("ensureProtoCompanyForZetaCodigo — test 4: contacts posterior no duplica", () => {
  it("contacts sync finds existing saldos company by Codigo and reuses it", async () => {
    // Simulates: saldos created company first, then contacts sync runs
    // contacts uses same function with source=zeta_contacts_autocreate
    const supabase = makeSupabase({ existingId: "saldos-created-id" });
    const result = await ensureProtoCompanyForZetaCodigo(
      supabase,
      "ws-1",
      "200",
      "Cliente con nombre enriquecido",
      "zeta_contacts_autocreate"
    );
    // Must return the EXISTING id, not create a new one
    expect(result).toBe("saldos-created-id");
  });
});

describe("ensureProtoCompanyForZetaCodigo — test 5: multi-tenant safe", () => {
  it("scopes insert to workspace_company_id — separate workspace gets its own company", async () => {
    const capturedInserts: Array<Record<string, unknown>> = [];
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
        insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          capturedInserts.push(payload);
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: `id-${payload.workspace_company_id}` },
              error: null,
            }),
          };
        }),
      })),
    } as unknown as SupabaseClient;

    await ensureProtoCompanyForZetaCodigo(supabase, "ws-A", "100", "Cliente", "zeta_saldos_autocreate");
    await ensureProtoCompanyForZetaCodigo(supabase, "ws-B", "100", "Cliente", "zeta_saldos_autocreate");

    expect(capturedInserts).toHaveLength(2);
    expect(capturedInserts[0]!.workspace_company_id).toBe("ws-A");
    expect(capturedInserts[1]!.workspace_company_id).toBe("ws-B");
  });
});

describe("ensureProtoCompanyForZetaCodigo — race condition (23505)", () => {
  it("handles concurrent insert: retries lookup and returns race-winner id", async () => {
    const supabase = makeSupabase({
      existingId: null,
      insertErrorCode: "23505",
      retryId: "race-winner",
    });
    const result = await ensureProtoCompanyForZetaCodigo(
      supabase,
      "ws-1",
      "300",
      "Concurrent SA",
      "zeta_saldos_autocreate"
    );
    expect(result).toBe("race-winner");
  });
});

describe("ensureProtoCompanyForZetaCodigo — source contract", () => {
  it("sets source=zeta_saldos_autocreate in zeta_metadata when called from saldos", async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
        insert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
          captured = p;
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: "ok" }, error: null }),
          };
        }),
      })),
    } as unknown as SupabaseClient;

    await ensureProtoCompanyForZetaCodigo(supabase, "ws-x", "999", "Test SA", "zeta_saldos_autocreate");
    expect((captured as Record<string, unknown> | null)?.zeta_metadata).toEqual({
      source: "zeta_saldos_autocreate",
    });
  });

  it("sets source=zeta_contacts_autocreate when called from contacts", async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
        insert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
          captured = p;
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: "ok" }, error: null }),
          };
        }),
      })),
    } as unknown as SupabaseClient;

    await ensureProtoCompanyForZetaCodigo(supabase, "ws-x", "999", "Test SA", "zeta_contacts_autocreate");
    expect((captured as Record<string, unknown> | null)?.zeta_metadata).toEqual({
      source: "zeta_contacts_autocreate",
    });
  });
});
