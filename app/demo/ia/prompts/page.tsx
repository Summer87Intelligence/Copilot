"use client";

import { FileText, Sparkles } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotBadge, CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";

const PROMPTS = [
  {
    id: "p1",
    name: "Brief ejecutivo · cuenta",
    variant: "v2.3",
    use: "Diagnóstico",
    snippet: "Sintetizá en 4 viñetas el estado de la cuenta y el riesgo de churn…",
  },
  {
    id: "p2",
    name: "Mensaje WhatsApp · tono consultivo",
    variant: "v1.8",
    use: "Generación",
    snippet: "Proponé un mensaje corto, sin presión, invitando a una llamada de 15m…",
  },
  {
    id: "p3",
    name: "Priorización · cartera",
    variant: "v3.0",
    use: "Optimizador",
    snippet: "Ordená oportunidades por impacto esperado y ventana temporal…",
  },
] as const;

export default function DemoIaPromptsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="IA · Contenido"
        title="Prompts"
        description="Biblioteca de plantillas y variantes usadas por los agentes — vista demo sin edición persistente."
        right={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Demo
          </span>
        }
      />

      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        <CopilotSectionTitle
          title="Plantillas activas"
          subtitle="Cada prompt está versionado y asociado a un rol del cerebro."
        />
        <ul className="space-y-4">
          {PROMPTS.map((p) => (
            <CopilotCard key={p.id} className="border-amber-200/50 bg-white/90">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-900 ring-1 ring-amber-200/80">
                    <FileText className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">{p.name}</p>
                    <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                      {p.snippet}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopilotBadge tone="neutral">{p.variant}</CopilotBadge>
                  <CopilotBadge tone="success">{p.use}</CopilotBadge>
                </div>
              </div>
            </CopilotCard>
          ))}
        </ul>
      </div>
    </div>
  );
}
