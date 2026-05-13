"use client";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";

const totalSteps = 2;

export default function RutaCobranzaPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="¿Voy a cobrar lo que necesito?"
        description="Atajos directos a cartera y acciones de cobranza."
      />
      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        <DecisionStep
          stepIndex={1}
          totalSteps={totalSteps}
          title="La deuda vencida es prioridad"
          description="Cada peso vencido es caja que no está disponible para pagar o invertir."
          durationHint="~1 min"
          impact="Recuperar un cliente grande a veces cubre varias obligaciones chicas."
          ctaLabel="Abrir clientes"
          nextHref="/copilot/clientes"
        />
        <DecisionStep
          stepIndex={2}
          totalSteps={totalSteps}
          title="Convertí lectura en movimiento"
          description="Registrá mail, llamada o tarea para que el equipo ejecute igual."
          durationHint="~1 min"
          ctaLabel="Ir a Acciones"
          nextHref="/copilot/acciones"
        />
      </div>
    </div>
  );
}
