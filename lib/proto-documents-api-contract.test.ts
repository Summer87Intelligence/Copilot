import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/copilot/proto-documents/route";
import { POST as POSTArchive } from "@/app/api/copilot/data/documents/archive/route";
import { POST as POSTRestore } from "@/app/api/copilot/data/documents/restore/route";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import * as protoDocumentsRepo from "@/lib/data/proto-documents-repository";
import { protoArchiveDocument, protoRestoreDocument } from "@/lib/copilot-proto-crud-service";
import { getFiscalAlerts } from "@/lib/copilot-tax-alerts";
import { getDocumentsByRelatedTableForClient } from "@/lib/copilot-documents-data";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

vi.mock("@/lib/copilot-api-auth", () => ({
  requireCopilotTenantContext: vi.fn(),
}));

vi.mock("@/lib/copilot-structured-logger", () => ({
  copilotRequestLogger: vi.fn(() => ({
    warn: vi.fn(),
    error: vi.fn(),
    withTenant: vi.fn(function (this: unknown) {
      return this;
    }),
  })),
}));

vi.mock("@/lib/supabase-route-client", () => ({
  createRouteSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: { message: "no session" } }),
    },
  })),
}));

vi.mock("@/lib/data/proto-documents-repository", () => ({
  getDocumentById: vi.fn(),
  getDocumentsByRelation: vi.fn(),
  getDocumentsByRelatedTable: vi.fn(),
  getDocumentsByType: vi.fn(),
  listActiveProtoDocuments: vi.fn(),
}));

vi.mock("@/lib/copilot-documents-data", () => ({
  DOCUMENT_RELATED_TABLE: { taxObligation: "proto_tax_obligations" },
  getDocumentsByRelation: vi.fn(),
  getDocumentsByRelatedTable: vi.fn(),
  getDocumentsByType: vi.fn(),
  getProtoDocuments: vi.fn(),
  getDocumentById: vi.fn(),
  getDocumentsByRelatedTableForClient: vi.fn(),
}));

vi.mock("@/lib/copilot-tax-data", () => ({
  getProtoTaxObligations: vi.fn().mockResolvedValue([]),
  getProtoTaxPayments: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/copilot-financial-engine", () => {
  const snap = {
    available_cash: 0,
    expected_inflows: 0,
    expected_outflows: 0,
    projected_balance: 0,
    coverage_ratio: 0,
    risk_level: "low" as const,
    realized: {
      cash_net: 0,
      receipts_gross: 0,
      payments_gross: 0,
      tax_paid_ltd: 0,
    },
  };
  return {
    getFinancialSnapshot: vi.fn().mockResolvedValue(snap),
    getFinancialSnapshotForApi: vi.fn().mockResolvedValue(snap),
  };
});

const mockAuth = vi.mocked(requireCopilotTenantContext);
const mockListActive = vi.mocked(protoDocumentsRepo.listActiveProtoDocuments);
const mockGetDocumentById = vi.mocked(protoDocumentsRepo.getDocumentById);

function jsonRequest(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(url, init);
}

describe("GET /api/copilot/proto-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActive.mockResolvedValue([]);
    mockGetDocumentById.mockResolvedValue(null);
  });

  it("403 cuando requireCopilotTenantContext falla", async () => {
    mockAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, code: "FORBIDDEN_TENANT" }, { status: 403 }),
    });

    const res = await GET(jsonRequest("http://localhost/api/copilot/proto-documents"));
    expect(res.status).toBe(403);
  });

  it("403 FORBIDDEN_TENANT cuando tenantCompanyId está vacío", async () => {
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        tenantCompanyId: "   ",
        supabase: {} as never,
        appUser: {} as never,
        authUser: {} as never,
      },
    });

    const res = await GET(jsonRequest("http://localhost/api/copilot/proto-documents"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("FORBIDDEN_TENANT");
  });

  it("200 y pasa tenantCompanyId al repositorio (listado activo)", async () => {
    const fakeSupabase = { auth: {} } as never;
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        tenantCompanyId: "tenant-uuid-99",
        supabase: fakeSupabase,
        appUser: {} as never,
        authUser: {} as never,
      },
    });

    mockListActive.mockResolvedValue([
      {
        id: "d1",
        document_type: "pdf",
        related_table: "proto_invoices",
        related_id: "inv-1",
        file_name: null,
        file_url: null,
        mime_type: null,
        reference: null,
        issue_date: null,
        status: "active",
        notes: null,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ]);

    const res = await GET(jsonRequest("http://localhost/api/copilot/proto-documents"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data?: { documents: unknown[] } };
    expect(json.ok).toBe(true);
    expect(json.data?.documents).toHaveLength(1);

    expect(mockListActive).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-uuid-99"
    );
    expect(createRouteSupabaseClient).toHaveBeenCalled();
  });

  it("GET con ?id= delega en getDocumentById con tenant", async () => {
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        tenantCompanyId: "tenant-a",
        supabase: {} as never,
        appUser: {} as never,
        authUser: {} as never,
      },
    });
    mockGetDocumentById.mockResolvedValue(null);

    const res = await GET(
      jsonRequest("http://localhost/api/copilot/proto-documents?id=doc-123")
    );
    expect(res.status).toBe(200);
    expect(mockGetDocumentById).toHaveBeenCalledWith(
      expect.anything(),
      "doc-123",
      "tenant-a"
    );
  });
});

describe("POST /api/copilot/data/documents/archive y restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("archive: 403 sin contexto de tenant", async () => {
    mockAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 403 }),
    });

    const res = await POSTArchive(
      jsonRequest("http://localhost/api/copilot/data/documents/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "any-id" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("archive: NOT_FOUND si el documento no pertenece al workspace (select vacío)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle,
            }),
          }),
        }),
      })),
    };

    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        tenantCompanyId: "tenant-a",
        supabase: supabase as never,
        appUser: {} as never,
        authUser: {} as never,
      },
    });

    const res = await POSTArchive(
      jsonRequest("http://localhost/api/copilot/data/documents/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "doc-en-otro-tenant" }),
      })
    );
    expect(res.status).toBe(404);
    expect(maybeSingle).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("archive: éxito cuando existe fila con id + workspace_company_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "doc-1" }, error: null });
    const updateEqWorkspace = vi.fn().mockResolvedValue({ error: null });
    let fromCalls = 0;
    const supabase = {
      from: vi.fn(() => {
        fromCalls += 1;
        if (fromCalls === 1) {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle,
                }),
              }),
            }),
          };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: updateEqWorkspace,
            }),
          }),
        };
      }),
    };

    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        tenantCompanyId: "tenant-a",
        supabase: supabase as never,
        appUser: {} as never,
        authUser: {} as never,
      },
    });

    const res = await POSTArchive(
      jsonRequest("http://localhost/api/copilot/data/documents/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "doc-1" }),
      })
    );
    expect(res.status).toBe(200);
    expect(updateEqWorkspace).toHaveBeenCalled();
  });

  it("restore: 403 sin contexto de tenant", async () => {
    mockAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 403 }),
    });

    const res = await POSTRestore(
      jsonRequest("http://localhost/api/copilot/data/documents/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "any-id" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("restore: no devuelve 200 si la fila no existe en el workspace tras update", async () => {
    let fromCalls = 0;
    const supabase = {
      from: vi.fn(() => {
        fromCalls += 1;
        if (fromCalls === 1) {
          return {
            update: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }),
    };

    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        tenantCompanyId: "tenant-a",
        supabase: supabase as never,
        appUser: {} as never,
        authUser: {} as never,
      },
    });

    const res = await POSTRestore(
      jsonRequest("http://localhost/api/copilot/data/documents/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "doc-otro-tenant" }),
      })
    );
    expect(res.status).toBe(500);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});

describe("protoArchiveDocument / protoRestoreDocument — fail-closed workspace", () => {
  it("protoArchiveDocument rechaza workspace vacío", async () => {
    const r = await protoArchiveDocument({} as never, "doc-1", "   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VALIDATION");
  });

  it("protoRestoreDocument rechaza workspace vacío", async () => {
    const r = await protoRestoreDocument({} as never, "doc-1", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VALIDATION");
  });
});

describe("getFiscalAlerts — documentos fiscales fail-closed sin workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con cliente Supabase pero sin workspaceCompanyId no llama getDocumentsByRelatedTableForClient", async () => {
    await getFiscalAlerts({} as never, "");
    expect(getDocumentsByRelatedTableForClient).not.toHaveBeenCalled();
  });
});
