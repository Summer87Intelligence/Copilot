import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionesShell } from "./decisiones-shell";

export const dynamic = "force-dynamic";

export default function DecisionesPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Motor de decisiones"
        description="Priorización automática de cobranza, score de cartera y alertas de riesgo financiero."
      />
      <div className="px-6 pb-12 pt-6">
        <Suspense fallback={<DecisionesFallback />}>
          <DecisionesShell />
        </Suspense>
      </div>
    </>
  );
}

function DecisionesFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--copilot-text-muted)]">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">Inicializando motor de decisiones…</p>
    </div>
  );
}
