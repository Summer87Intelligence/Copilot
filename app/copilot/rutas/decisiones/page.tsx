"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 3;

export default function RutaDecisionesPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        title="Decisiones pendientes"
        description="Del disparador a la acción, sin perder el hilo."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 1 ? (
          <DecisionStep
            stepIndex={1}
            totalSteps={totalSteps}
            title="Iniciativa → decisión → acción"
            description="El flujo operativo muestra dónde quedó cada caso y qué falta cerrar."
            durationHint="~1 min"
            impact="Un caso abierto demasiado tiempo suele significar caja o relación en riesgo."
            ctaLabel="Ver pipeline completo"
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <DecisionStep
            stepIndex={2}
            totalSteps={totalSteps}
            title="Priorizá por impacto"
            description="Ordená por severidad y canal: primero lo que mueve caja o cumplimiento."
            durationHint="~2 min"
            ctaLabel="Seguir en Gestión IA"
            onNext={() => setStep(3)}
          />
        ) : null}
        {step === 3 ? (
          <DecisionStep
            stepIndex={3}
            totalSteps={totalSteps}
            title="Ejecutá y registrá resultado"
            description="Las acciones generadas necesitan un cierre para alimentar el aprendizaje del copiloto."
            durationHint="~1 min"
            ctaLabel="Ir a Gestión IA"
            nextHref="/copilot/gestion-ia"
          />
        ) : null}
      </div>
    </div>
  );
}
