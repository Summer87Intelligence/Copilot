"use client";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 2;

export default function RutaPagosImpuestosPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="¿Puedo cumplir con pagos e impuestos?"
        description="Obligaciones, caja y tesorería en dos pasos directos."
      />
      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        <DecisionStep
          stepIndex={1}
          totalSteps={totalSteps}
          title="Qué tenés que pagar"
          description="Calendario fiscal y montos en la misma lectura que usa tu operación."
          durationHint="~1 min"
          impact="Pagar a tiempo evita recargos y corta el ruido con organismos."
          ctaLabel="Abrir Finanzas"
          nextHref="/copilot/finanzas#copilot-finanzas-fiscal"
        />
        <DecisionStep
          stepIndex={2}
          totalSteps={totalSteps}
          title="Caja y obligaciones proyectadas"
          description="Compará caja disponible con egresos esperados y obligaciones manuales en Tesorería."
          durationHint="~1 min"
          ctaLabel="Abrir Tesorería"
          nextHref="/copilot/tesoreria"
        />
      </div>
    </div>
  );
}
