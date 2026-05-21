import { Suspense } from "react";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { OicHealthPanel } from "@/components/copilot/operacional/oic-health-panel";
import { OicQuickStats } from "@/components/copilot/operacional/oic-quick-stats";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";

export const dynamic = "force-dynamic";

export default function OperacionalPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Centro Operacional"
        description="Salud del sistema, reconciliación financiera y actividad de pipelines en tiempo real."
      />
      <div className="space-y-5 px-6 py-6">
        <Suspense fallback={<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0,1,2,3].map(i=><OicSkeletonCard key={i} rows={2}/>)}</div>}>
          <OicQuickStats />
        </Suspense>
        <Suspense fallback={<OicSkeletonCard rows={7} />}>
          <OicHealthPanel />
        </Suspense>
      </div>
    </>
  );
}
