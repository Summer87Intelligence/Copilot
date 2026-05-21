import { Suspense } from "react";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { OicSnapshotTable } from "@/components/copilot/operacional/oic-snapshot-table";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";

export const dynamic = "force-dynamic";

export default function SnapshotsPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Operacional"
        title="Snapshots de Auditoría"
        description="Registro histórico de snapshots computados: salud, reconciliación, actividad y drift."
      />
      <div className="px-6 py-6">
        <Suspense fallback={<OicSkeletonCard rows={8} />}>
          <OicSnapshotTable />
        </Suspense>
      </div>
    </>
  );
}
