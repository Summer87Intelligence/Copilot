import type { CronLogFn } from "@/lib/observability/cron-logger";
import { generateOperationalNotificationsForWorkspace } from "./generate-operational-notifications";

/**
 * Runs notification generation after a Zeta sync, best-effort.
 * Never throws — any failure is logged as a warning and ignored.
 */
export async function runNotificationGenerationBestEffort({
  workspaceCompanyId,
  source,
  logger,
}: {
  workspaceCompanyId: string;
  source: string;
  logger: CronLogFn;
}): Promise<void> {
  try {
    const result = await generateOperationalNotificationsForWorkspace({
      workspaceCompanyId,
    });
    logger("notifications_generated_best_effort", {
      workspace_id: workspaceCompanyId,
      source,
      created: result.created,
      skipped: result.skipped,
      by_type: result.byType,
      ok: result.ok,
    });
  } catch (err) {
    logger("notifications_generation_warning", {
      workspace_id: workspaceCompanyId,
      source,
      error: String(err),
    });
  }
}
