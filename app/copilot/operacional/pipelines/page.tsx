import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { PipelinesOverview } from "@/components/copilot/operacional/pipelines-overview";

export default function PipelinesPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Operacional"
        title="Pipelines"
        description="Estado de sincronización Zeta en tiempo real. Salud de todos los pipelines operativos."
      />
      <div className="px-6 py-6">
        <PipelinesOverview />
      </div>
    </>
  );
}
