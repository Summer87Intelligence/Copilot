"use client";

import Link from "next/link";

import { CopilotOperationalEmptyState } from "@/components/copilot/copilot-operational-empty-state";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotSectionTitle, copilotPageMainClass } from "@/components/copilot/copilot-ui";

export default function CopilotEscenariosPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.escenarios"
        title="Escenarios"
        description="Compará lecturas de riesgo, estabilidad y crecimiento cuando el motor esté alimentado por tus datos — sin simulaciones de relleno."
      />

      <div className={copilotPageMainClass}>
        <CopilotOperationalEmptyState
          title="Motor listo"
          status="Esperando configuración y datos mínimos"
          statusTone="info"
          metrics={[
            { label: "Escenarios", value: 0 },
            { label: "Comparativas", value: 0 },
            { label: "Riesgo", value: "—" },
            { label: "Crecimiento", value: "—" },
          ]}
          footnote="Cargá estructura mínima en Datos y alineá caja en Finanzas para habilitar lecturas comparables."
        />

        <CopilotCard>
          <CopilotSectionTitle
            title="Próximos pasos sugeridos"
            subtitle="Para que esta vista tenga sentido operativo."
          />
          <ul className="space-y-2 text-xs text-[var(--copilot-ink-muted)]">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
              <span>
                Cargá estructura mínima en{" "}
                <Link
                  href="/copilot/datos"
                  className="font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Datos
                </Link>{" "}
                (empresas, facturas, pagos).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
              <span>
                Revisá caja y obligaciones en{" "}
                <Link
                  href="/copilot/finanzas"
                  className="font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Finanzas
                </Link>{" "}
                para alinear escenarios con liquidez real.
              </span>
            </li>
          </ul>
        </CopilotCard>
      </div>
    </div>
  );
}
