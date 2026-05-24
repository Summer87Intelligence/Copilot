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
        description="Comparación de riesgo, estabilidad y crecimiento. Próximamente disponible."
      />

      <div className={copilotPageMainClass}>
        <CopilotOperationalEmptyState
          title="En preparación"
          status="Esta sección todavía no está activa"
          statusTone="info"
          metrics={[
            { label: "Escenarios", value: 0 },
            { label: "Comparativas", value: 0 },
            { label: "Riesgo", value: "—" },
            { label: "Crecimiento", value: "—" },
          ]}
          footnote="Mientras tanto, podés ver el estado de cartera en Cartera y el flujo de caja en Tesorería."
        />

        <CopilotCard>
          <CopilotSectionTitle
            title="Mientras tanto"
            subtitle="Estas secciones ya están disponibles."
          />
          <ul className="space-y-2 text-xs text-[var(--copilot-ink-muted)]">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
              <span>
                Revisá el estado de cartera en{" "}
                <Link
                  href="/copilot/cartera"
                  className="font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Cartera
                </Link>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
              <span>
                Seguí el flujo de caja en{" "}
                <Link
                  href="/copilot/tesoreria"
                  className="font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Tesorería
                </Link>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
              <span>
                Volvé a{" "}
                <Link
                  href="/copilot/hoy"
                  className="font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Hoy
                </Link>{" "}
                para ver el resumen del negocio.
              </span>
            </li>
          </ul>
        </CopilotCard>
      </div>
    </div>
  );
}
