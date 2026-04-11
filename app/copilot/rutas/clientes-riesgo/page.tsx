"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 3;

export default function RutaClientesRiesgoPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        title="Clientes en riesgo"
        description="Concentración, saldos y comportamiento de pago."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 1 ? (
          <DecisionStep
            stepIndex={1}
            totalSteps={totalSteps}
            title="Riesgo = dependencia + saldo"
            description="Un cliente con alto saldo o mal comportamiento mueve tu caja más que muchas cuentas chicas."
            durationHint="~1 min"
            impact="Actuar temprano suele evitar write-offs y tensiones legales."
            ctaLabel="Ver ranking de cartera"
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <DecisionStep
            stepIndex={2}
            totalSteps={totalSteps}
            title="Detalle por cuenta"
            description="En Clientes abrís cada empresa y ves facturas, recibos y deuda vencida junto."
            durationHint="~2 min"
            ctaLabel="Abrir clientes"
            onNext={() => setStep(3)}
          />
        ) : null}
        {step === 3 ? (
          <DecisionStep
            stepIndex={3}
            totalSteps={totalSteps}
            title="Siguiente movimiento"
            description="Registrá la acción comercial o de cobranzas para que quede trazada."
            durationHint="~1 min"
            ctaLabel="Ir a acciones"
            nextHref="/copilot/acciones"
          />
        ) : null}
      </div>
    </div>
  );
}
