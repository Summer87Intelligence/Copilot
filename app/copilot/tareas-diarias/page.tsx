import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { DailyTasksPageClient } from "@/components/copilot/daily-tasks/daily-tasks-page-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("daily_tasks")) {
    return <AccessDeniedCard />;
  }
  return <DailyTasksPageClient />;
}
