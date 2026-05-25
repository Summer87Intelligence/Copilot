import { Bot } from "lucide-react";

import { AgentesOrchestrationView } from "@/components/copilot/agentes/agentes-orchestration-view";

export default function AgentesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Hero */}
      <div className="mb-8">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          <Bot className="h-3.5 w-3.5" aria-hidden />
          Agentes IA
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--copilot-ink)] sm:text-2xl">
          Agentes IA
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--copilot-ink-muted)]">
          Asistentes que analizan tu negocio, ordenan prioridades y te indican
          qué revisar primero.
        </p>
      </div>

      <AgentesOrchestrationView />
    </div>
  );
}
