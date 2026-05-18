import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/copilot/decision-engine/daily-queue/route";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  isDailyQueueSnapshotFresh,
  readDailyQueueSnapshot,
} from "@/lib/data/decision-daily-queue-repository";
import { recalculateDailyOperationsQueue } from "@/lib/decision-engine/daily-queue-orchestrator";

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

vi.mock("@/lib/data/decision-daily-queue-repository", () => ({
  readDailyQueueSnapshot: vi.fn(),
  isDailyQueueSnapshotFresh: vi.fn(),
}));

vi.mock("@/lib/decision-engine/daily-queue-orchestrator", () => ({
  recalculateDailyOperationsQueue: vi.fn(),
}));

const mockAuth = vi.mocked(requireCopilotTenantContext);
const mockReadSnapshot = vi.mocked(readDailyQueueSnapshot);
const mockIsFresh = vi.mocked(isDailyQueueSnapshotFresh);
const mockRecalc = vi.mocked(recalculateDailyOperationsQueue);

const TENANT_ID = "tenant-abc";
const mockSupabase = {} as never;

const sampleQueue = {
  generated_at: "2026-05-18T12:00:00.000Z",
  sections: {
    urgent_today: [],
    high_impact: [],
    this_week: [],
    monitoring: [],
    automated: [],
  },
  groups: [],
  stats: {
    total_tasks: 0,
    urgent_count: 0,
    sla_breach_count: 0,
    promises_due_today: 0,
    by_section: {
      urgent_today: 0,
      high_impact: 0,
      this_week: 0,
      monitoring: 0,
      automated: 0,
    },
    by_category: {},
  },
};

function jsonRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/copilot/decision-engine/daily-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      ok: true,
      ctx: {
        tenantCompanyId: TENANT_ID,
        supabase: mockSupabase,
        appUser: {} as never,
        authUser: {} as never,
      },
    });
    mockReadSnapshot.mockResolvedValue(null);
    mockIsFresh.mockReturnValue(false);
    mockRecalc.mockResolvedValue({
      queue: sampleQueue,
      cached: false,
      generation_ms: 12,
    });
  });

  it("403 cuando requireCopilotTenantContext falla", async () => {
    mockAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, code: "FORBIDDEN_TENANT" }, { status: 403 }),
    });

    const res = await GET(jsonRequest("http://localhost/api/copilot/decision-engine/daily-queue"));
    expect(res.status).toBe(403);
    expect(mockRecalc).not.toHaveBeenCalled();
  });

  it("cache hit — no recalcula sin force", async () => {
    mockReadSnapshot.mockResolvedValue({
      id: "snap-1",
      workspace_company_id: TENANT_ID,
      generated_at: sampleQueue.generated_at,
      expires_at: "2026-05-18T13:00:00.000Z",
      generation_ms: 5,
      payload: sampleQueue,
    });
    mockIsFresh.mockReturnValue(true);

    const res = await GET(jsonRequest("http://localhost/api/copilot/decision-engine/daily-queue"));
    const body = (await res.json()) as { ok: boolean; cached: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cached).toBe(true);
    expect(mockRecalc).not.toHaveBeenCalled();
  });

  it("?force=true recalcula aunque haya caché fresca", async () => {
    mockReadSnapshot.mockResolvedValue({
      id: "snap-1",
      workspace_company_id: TENANT_ID,
      generated_at: sampleQueue.generated_at,
      expires_at: "2026-05-18T13:00:00.000Z",
      generation_ms: 5,
      payload: sampleQueue,
    });
    mockIsFresh.mockReturnValue(true);

    const res = await GET(
      jsonRequest("http://localhost/api/copilot/decision-engine/daily-queue?force=true")
    );
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockRecalc).toHaveBeenCalledWith(mockSupabase, TENANT_ID, {
      force: true,
      persist: true,
    });
  });
});
