"use client";

import Link from "next/link";

import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";

export default function CopilotEscenariosPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.escenarios"
        title="Escenarios"
        description="Compará lecturas de riesgo, estabilidad y crecimiento cuando el motor esté alimentado por tus datos — sin simulaciones de relleno."
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <CopilotEmptyPanel
          title={COPILOT_EMPTY_COPY.escenarios.title}
          paragraphs={COPILOT_EMPTY_COPY.escenarios.paragraphs}
          example={COPILOT_EMPTY_COPY.escenarios.example}
          importance="Mientras no haya escenarios calculados sobre `proto_*`, esta pantalla se mantiene honesta: orientación en lugar de números ficticios."
        />

        <CopilotCard>
          <CopilotSectionTitle
            title="Próximos pasos sugeridos"
            subtitle="Para que esta vista tenga sentido operativo."
          />
          <ul className="space-y-3 text-sm text-[var(--copilot-ink-muted)]">
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
