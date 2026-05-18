import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as assignPost } from "@/app/api/copilot/decision-engine/assign/route";
import { GET as statsGet } from "@/app/api/copilot/decision-engine/ownership-stats/route";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  assignOperationalOwnerForTenant,
  getOperationalOwnershipStatsForTenant,
} from "@/lib/decision-engine/decision-engine-ownership-service";

vi.mock("@/lib/copilot-api-auth", () => ({
  requireCopilotTenantContext: vi.fn(),
}));

vi.mock("@/lib/copilot-structured-logger", () => ({
  copilotRequestLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    withTenant: vi.fn(function (this: unknown) {
      return this;
    }),
  })),
}));

vi.mock("@/lib/decision-engine/decision-engine-ownership-service", () => ({
  assignOperationalOwnerForTenant: vi.fn(),
  unassignOperationalOwnerForTenant: vi.fn(),
  autoAssignOperationalOwnersForTenant: vi.fn(),
  getOperationalOwnershipStatsForTenant: vi.fn(),
}));

const mockAuth = vi.mocked(requireCopilotTenantContext);
const mockAssign = vi.mocked(assignOperationalOwnerForTenant);
const mockStats = vi.mocked(getOperationalOwnershipStatsForTenant);

const TENANT = "tenant-1";
const mockSupabase = {} as never;

describe("decision-engine ownership API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        supabase: mockSupabase,
        tenantCompanyId: TENANT,
        appUser: {
          id: "operator-1",
          company_id: TENANT,
          full_name: "Op",
          email: "o@t.com",
          role: "member",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        authUser: { id: "auth-1" } as never,
      },
    });
  });

  it("POST assign requiere tenant auth", async () => {
    mockAuth.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 }),
    });

    const req = new NextRequest("http://localhost/api/copilot/decision-engine/assign", {
      method: "POST",
      body: JSON.stringify({ customer_id: "c1", assigned_user_id: "u1" }),
    });
    const res = await assignPost(req);
    expect(res.status).toBe(401);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("POST assign persiste con tenant", async () => {
    mockAssign.mockResolvedValueOnce({
      customer_id: "c1",
      assigned_user_id: "u1",
    } as never);

    const req = new NextRequest("http://localhost/api/copilot/decision-engine/assign", {
      method: "POST",
      body: JSON.stringify({ customer_id: "c1", assigned_user_id: "u1", note: "tomar" }),
    });
    const res = await assignPost(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockAssign).toHaveBeenCalledWith(mockSupabase, TENANT, {
      customerId: "c1",
      assignedUserId: "u1",
      assignedBy: "operator-1",
      note: "tomar",
    });
  });

  it("GET ownership-stats tenant-safe", async () => {
    mockStats.mockResolvedValueOnce({
      total_assigned: 3,
      overdue_assigned: 1,
      unassigned_critical: 2,
      high_workload: false,
      operators: [],
    });

    const res = await statsGet(new NextRequest("http://localhost/api/copilot/decision-engine/ownership-stats"));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.stats.total_assigned).toBe(3);
    expect(mockStats).toHaveBeenCalledWith(mockSupabase, TENANT);
  });
});
