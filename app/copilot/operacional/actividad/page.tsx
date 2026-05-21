import { Suspense } from "react";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { OicActivityTimeline } from "@/components/copilot/operacional/oic-activity-timeline";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";

export const dynamic = "force-dynamic";

export default function ActividadPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Operacional"
        title="Actividad de Pipelines"
        description="Historial de ejecuciones de sync, saldos y vouchers de las últimas 48 horas."
      />
      <div className="px-6 py-6">
        <Suspense fallback={<OicSkeletonCard rows={8} />}>
          <OicActivityTimeline />
        </Suspense>
      </div>
    </>
  );
}
