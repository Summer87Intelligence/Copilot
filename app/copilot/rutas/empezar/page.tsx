"use client";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

export default function RutaEmpezarPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="Empezar el día"
        description="Atajo directo desde Hoy hacia alertas y finanzas."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        <DecisionStep
          stepIndex={1}
          totalSteps={1}
          title="Prioridad y alertas"
          description="El resumen operativo vive en Hoy. Si necesitás el listado completo de señales, entrá directo a Alertas o abrí Finanzas para caja y obligaciones."
          durationHint="~1 min"
          impact="Evitá recorrer pantallas legacy: Hoy concentra prioridad, alertas y recomendaciones."
          ctaLabel="Revisar alertas"
          nextHref="/copilot/alertas"
        />
      </div>
    </div>
  );
}
