import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isUuidAsPrimaryActorLabel } from "@/lib/bank-movements/bank-import-actor";
import { resolveImportHistoryStats } from "@/lib/bank-movements/bank-import-history-display";

const mocks = vi.hoisted(() => ({
  requireBankMovementsFullReadAccess: vi.fn(),
  enrichBankStatementImportsWithActors: vi.fn(),
}));

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireBankMovementsFullReadAccess: mocks.requireBankMovementsFullReadAccess,
}));

vi.mock("@/lib/bank-movements/bank-import-actor.server", () => ({
  enrichBankStatementImportsWithActors: mocks.enrichBankStatementImportsWithActors,
}));

import { GET } from "@/app/api/copilot/bank-movements/imports/route";

const UUID = "22535d5c-3c6d-4bc4-a9a1-550132a1819b";
const WS = "040321ff-10fd-4da3-aeca-f1865f879986";

const rawRow = {
  id: "imp-raw-1",
  workspace_id: WS,
  bank_name: "Santander",
  account_label: "Santander UYU",
  file_name: "auszug.pdf",
  file_type: "pdf",
  imported_by: UUID,
  imported_at: "2026-07-15T12:00:00Z",
  status: "parsed" as const,
  row_count: 11,
  metadata: { total_preview_count: 48, inserted_count: 11, already_exists_count: 37 },
  created_at: "2026-07-15T12:00:00Z",
  updated_at: "2026-07-15T12:00:00Z",
};

function orderChain(data: unknown[], error: unknown = null) {
  return {
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

describe("GET /api/copilot/bank-movements/imports — actors_unresolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("si enrich falla: API ok, conserva imported_by, marca actors_unresolved; UI no muestra UUID", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe("bank_statement_imports");
        return {
          select: vi.fn().mockReturnValue(orderChain([rawRow])),
        };
      }),
    };

    mocks.requireBankMovementsFullReadAccess.mockResolvedValue({
      ok: true,
      response: null,
      ctx: {
        supabase,
        tenantCompanyId: WS,
        appUser: { id: "u1", role: "superadmin", company_id: WS },
      },
    });
    mocks.enrichBankStatementImportsWithActors.mockRejectedValue(new Error("RESOLVE_APP_USERS_FAILED: boom"));

    const res = await GET(new NextRequest("http://localhost/api/copilot/bank-movements/imports"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: Array<{ imported_by: string | null; actor?: unknown }>;
      meta: { actors_unresolved?: boolean; total: number };
    };

    expect(json.ok).toBe(true);
    expect(json.meta.actors_unresolved).toBe(true);
    expect(json.meta.total).toBe(1);
    expect(json.data[0]!.imported_by).toBe(UUID);
    expect(json.data[0]!.actor).toBeUndefined();

    // Contrato visual: Historial resuelve sin actor enriquecido.
    const stats = resolveImportHistoryStats(json.data[0] as typeof rawRow);
    expect(stats.actor).toBe("Usuario del sistema");
    expect(isUuidAsPrimaryActorLabel(stats.actor)).toBe(false);
    expect(stats.actor).not.toBe(UUID);
  });

  it("filtra por workspace_id del tenant (aislamiento)", async () => {
    const eq = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({ eq }),
      })),
    };
    mocks.requireBankMovementsFullReadAccess.mockResolvedValue({
      ok: true,
      response: null,
      ctx: { supabase, tenantCompanyId: WS, appUser: { id: "u1" } },
    });
    mocks.enrichBankStatementImportsWithActors.mockResolvedValue([]);

    await GET(new NextRequest("http://localhost/api/copilot/bank-movements/imports"));
    expect(eq).toHaveBeenCalledWith("workspace_id", WS);
  });
});
