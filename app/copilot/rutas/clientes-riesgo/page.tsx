"use client";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 2;

export default function RutaClientesRiesgoPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="Clientes en riesgo"
        description="Concentración, saldos y comportamiento de pago."
      />
      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        <DecisionStep
          stepIndex={1}
          totalSteps={totalSteps}
          title="Riesgo = dependencia + saldo"
          description="Un cliente con alto saldo o mal comportamiento mueve tu caja más que muchas cuentas chicas."
          durationHint="~1 min"
          impact="Actuar temprano suele evitar write-offs y tensiones legales."
          ctaLabel="Abrir clientes"
          nextHref="/copilot/clientes"
        />
        <DecisionStep
          stepIndex={2}
          totalSteps={totalSteps}
          title="Siguiente movimiento"
          description="Registrá la acción comercial o de cobranzas para que quede trazada."
          durationHint="~1 min"
          ctaLabel="Ir a Acciones"
          nextHref="/copilot/acciones"
        />
      </div>
    </div>
  );
}
