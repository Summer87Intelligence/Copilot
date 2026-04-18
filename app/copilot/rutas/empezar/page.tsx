"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 3;

export default function RutaEmpezarPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="Empezar el día"
        description="Orden de atención antes de entrar al detalle."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 1 ? (
          <DecisionStep
            stepIndex={1}
            totalSteps={totalSteps}
            title="Primero: lo que no puede esperar"
            description="Las señales críticas y altas concentran el riesgo real del día."
            durationHint="~1 min"
            impact="Resolver una crítica hoy suele valer más que diez tareas cómodas."
            ctaLabel="Ver prioridades del día"
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <DecisionStep
            stepIndex={2}
            totalSteps={totalSteps}
            title="Segundo: el listado completo de alertas"
            description="Contexto y severidad de cada señal, sin ruido de tableros genéricos."
            durationHint="~2 min"
            ctaLabel="Revisar alertas"
            onNext={() => setStep(3)}
          />
        ) : null}
        {step === 3 ? (
          <DecisionStep
            stepIndex={3}
            totalSteps={totalSteps}
            title="Tercero: caja y obligaciones"
            description="Cerrá el triángulo: alertas → caja → lo que se vence."
            durationHint="~1 min"
            ctaLabel="Ir a atención prioritaria"
            nextHref="/copilot/atencion-prioritaria"
          />
        ) : null}
      </div>
    </div>
  );
}
