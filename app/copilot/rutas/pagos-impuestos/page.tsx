"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 3;

export default function RutaPagosImpuestosPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="¿Puedo cumplir con pagos e impuestos?"
        description="Obligaciones, caja y coherencia en tres pasos."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 1 ? (
          <DecisionStep
            stepIndex={1}
            totalSteps={totalSteps}
            title="Qué tenés que pagar"
            description="Calendario fiscal y montos en la misma lectura que usa tu operación."
            durationHint="~1 min"
            impact="Pagar a tiempo evita recargos y corta el ruido con organismos."
            ctaLabel="Ver finanzas y obligaciones"
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <DecisionStep
            stepIndex={2}
            totalSteps={totalSteps}
            title="Caja vs. compromisos"
            description="Compará caja disponible con egresos esperados y obligaciones próximas."
            durationHint="~2 min"
            ctaLabel="Abrir finanzas"
            onNext={() => setStep(3)}
          />
        ) : null}
        {step === 3 ? (
          <DecisionStep
            stepIndex={3}
            totalSteps={totalSteps}
            title="Si falta data, cargala"
            description="Facturas, pagos y obligaciones actualizados mantienen esta lectura fiel."
            durationHint="~1 min"
            ctaLabel="Ir a datos"
            nextHref="/copilot/datos"
          />
        ) : null}
      </div>
    </div>
  );
}
