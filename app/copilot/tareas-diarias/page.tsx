import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { UnifiedTasksPanel } from "@/components/copilot/daily-tasks/unified-tasks-panel";
import { COPILOT_PAGE_GAP } from "@/components/copilot/ui/copilot-visual-system";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("daily_tasks")) {
    return <AccessDeniedCard />;
  }
  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Tareas"
        description="Tu trabajo pendiente, las tareas asignadas y las recomendaciones del sistema."
      />
      <UnifiedTasksPanel />
    </div>
  );
}
