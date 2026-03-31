"use client";

import { Layers, Sparkles } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotBadge, CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";

const CATS = [
  { id: "ca", label: "Etapa de compra", items: ["Descubrimiento", "Evaluación", "Cierre"] },
  { id: "cb", label: "Industria", items: ["Servicios", "Manufactura", "SaaS"] },
  { id: "cc", label: "Señales", items: ["Intención alta", "Riesgo churn", "Ventana corta"] },
] as const;

export default function DemoIaCategoriasPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="IA · Taxonomía"
        title="Categorías"
        description="Cómo el cerebro clasifica oportunidades y señales — estructura demo para presentaciones."
        right={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Demo
          </span>
        }
      />

      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        <CopilotSectionTitle
          title="Dimensiones"
          subtitle="Cada dimensión alimenta scoring y reglas de contacto."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {CATS.map((c) => (
            <CopilotCard key={c.id} className="border-amber-200/50 bg-white/90">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-amber-800" aria-hidden />
                <p className="font-semibold text-[var(--copilot-ink)]">{c.label}</p>
              </div>
              <ul className="mt-4 space-y-2">
                {c.items.map((t) => (
                  <li key={t}>
                    <CopilotBadge tone="neutral">{t}</CopilotBadge>
                  </li>
                ))}
              </ul>
            </CopilotCard>
          ))}
        </div>
      </div>
    </div>
  );
}
