"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 3;

export default function RutaCobranzaPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        title="¿Voy a cobrar lo que necesito?"
        description="Enfocate en saldos vencidos y en quién te debe."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 1 ? (
          <DecisionStep
            stepIndex={1}
            totalSteps={totalSteps}
            title="La deuda vencida es prioridad"
            description="Cada peso vencido es caja que no está disponible para pagar o invertir."
            durationHint="~1 min"
            impact="Recuperar un cliente grande a veces cubre varias obligaciones chicas."
            ctaLabel="Ver cartera y saldos"
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <DecisionStep
            stepIndex={2}
            totalSteps={totalSteps}
            title="Cliente por cliente"
            description="En Clientes ves facturas abiertas, vencimientos y riesgo en lenguaje de negocio."
            durationHint="~2 min"
            ctaLabel="Abrir clientes"
            onNext={() => setStep(3)}
          />
        ) : null}
        {step === 3 ? (
          <DecisionStep
            stepIndex={3}
            totalSteps={totalSteps}
            title="Convertí lectura en movimiento"
            description="Registrá mail, llamada o tarea para que el equipo ejecute igual."
            durationHint="~1 min"
            ctaLabel="Ir a acciones"
            nextHref="/copilot/acciones"
          />
        ) : null}
      </div>
    </div>
  );
}
