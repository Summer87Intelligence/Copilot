"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 2;

export default function RutaDecisionesPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="Decisiones pendientes"
        description="Del disparador a la acción, sin pasar por listados legacy."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 1 ? (
          <DecisionStep
            stepIndex={1}
            totalSteps={totalSteps}
            title="De la señal a la acción"
            description="Hoy resume las recomendaciones. El seguimiento operativo vive en Acciones."
            durationHint="~1 min"
            impact="Un caso abierto demasiado tiempo suele significar caja o relación en riesgo."
            ctaLabel="Ver recomendaciones en Hoy"
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <DecisionStep
            stepIndex={2}
            totalSteps={totalSteps}
            title="Ejecutá y registrá resultado"
            description="Cerrá el ciclo en Acciones. El listado avanzado de IA queda como referencia histórica."
            durationHint="~1 min"
            ctaLabel="Ir a Acciones"
            nextHref="/copilot/acciones"
          />
        ) : null}
      </div>
    </div>
  );
}
