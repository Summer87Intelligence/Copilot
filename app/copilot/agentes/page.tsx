import { Bot } from "lucide-react";

import { AgentesComingSoonView } from "@/components/copilot/agentes/agentes-coming-soon-view";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

export default async function AgentesPage() {
  if (await isModuleAccessDenied("agentes")) return <AccessDeniedCard />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-4">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          <Bot className="h-3.5 w-3.5" aria-hidden />
          Agentes IA
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--copilot-ink)] sm:text-2xl">
          Agentes IA
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[var(--copilot-ink-muted)]">
          Próximamente: lecturas automáticas que complementan Hoy y Dashboard. Hoy
          seguís operando con las pantallas actuales.
        </p>
      </div>

      <AgentesComingSoonView />
    </div>
  );
}
