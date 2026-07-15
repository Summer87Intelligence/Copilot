import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  applyRecommendationAction,
  type UnifiedTaskFeedContext,
} from "@/lib/tasks/unified-task-feed.server";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    stableKey: z.string().trim().min(1).max(180),
    action: z.enum(["claim", "start", "dismiss", "materialize"]),
  })
  .strict();

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "daily_tasks",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const ctx: UnifiedTaskFeedContext = {
    supabase: auth.ctx.supabase,
    workspaceId: auth.ctx.tenantCompanyId,
    appUser: auth.ctx.appUser,
  };

  const result = await applyRecommendationAction(ctx, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false as const, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true as const, data: result.task });
}
