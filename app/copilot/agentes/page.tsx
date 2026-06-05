import { Bot } from "lucide-react";

import { AgentesOrchestrationView } from "@/components/copilot/agentes/agentes-orchestration-view";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

export default async function AgentesPage() {
  if (await isModuleAccessDenied("agentes")) return <AccessDeniedCard />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="mb-8 space-y-4">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          <Bot className="h-3.5 w-3.5" aria-hidden />
          Agentes IA
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--copilot-ink)] sm:text-2xl">
          Agentes IA
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--copilot-ink-muted)]">
          Análisis de tendencias, riesgos y señales que complementan lo que ya ves en Hoy.
        </p>
        <div className="max-w-2xl rounded-2xl border border-[var(--copilot-border)]/70 bg-[rgba(44,40,37,0.02)] px-4 py-3">
          <p className="text-[13px] text-[var(--copilot-ink-muted)]">
            Los agentes no modifican datos ni ejecutan acciones solos.
          </p>
        </div>
      </div>

      <AgentesOrchestrationView />
    </div>
  );
}
