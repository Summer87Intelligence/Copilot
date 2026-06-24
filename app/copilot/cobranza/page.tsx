import { Suspense } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { CobranzaPageClient } from "@/components/copilot/cobranza/cobranza-page-client";

export const dynamic = "force-dynamic";

export default async function CobranzaPage() {
  if (await isModuleAccessDenied("cobranza")) return <AccessDeniedCard />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Cobranza"
        description="Clientes a gestionar, agenda de seguimientos y cobros pendientes."
      />
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-20 text-sm text-[var(--copilot-muted)]">
            Cargando cobranza…
          </div>
        }
      >
        <CobranzaPageClient />
      </Suspense>
    </div>
  );
}
