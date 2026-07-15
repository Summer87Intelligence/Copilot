import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  getUnifiedTaskFeed,
  type UnifiedTaskFeedContext,
} from "@/lib/tasks/unified-task-feed.server";
import {
  UNIFIED_TASK_TABS,
  type UnifiedTaskFilters,
} from "@/lib/tasks/unified-task-feed";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tab: z.enum(UNIFIED_TASK_TABS).optional(),
  search: z.string().trim().max(120).optional(),
  module: z.string().trim().max(60).optional(),
  priority: z.string().trim().max(20).optional(),
  status: z.string().trim().max(30).optional(),
  source: z.string().trim().max(30).optional(),
  assignee: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function parseFilters(request: NextRequest): UnifiedTaskFilters {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return {};
  return parsed.data;
}

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const ctx: UnifiedTaskFeedContext = {
    supabase: auth.ctx.supabase,
    workspaceId: auth.ctx.tenantCompanyId,
    appUser: auth.ctx.appUser,
  };

  try {
    const feed = await getUnifiedTaskFeed(ctx, parseFilters(request));
    return NextResponse.json({
      ok: true as const,
      items: feed.items,
      summary: feed.summary,
      meta: { ...feed.meta, migration_pending: feed.migrationPending },
    });
  } catch (error) {
    console.error("[tasks-feed] GET failed:", error);
    return NextResponse.json(
      { ok: false as const, error: "No pudimos cargar tus tareas." },
      { status: 500 }
    );
  }
}
