"use client";

import { BarChart3, Bot, ShieldCheck, Wallet } from "lucide-react";

import { AgentCard } from "@/components/copilot/agentes/agent-card";
import { DailyExecutiveAgent } from "@/components/copilot/agentes/daily-executive-agent";

export default function AgentesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          <Bot className="h-3.5 w-3.5" aria-hidden />
          Agentes IA
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--copilot-ink)] sm:text-2xl">
          Agentes IA
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--copilot-ink-muted)]">
          Asistentes que analizan tu negocio y te ayudan a decidir que hacer primero.
        </p>
      </div>

      <section className="mb-10">
        <DailyExecutiveAgent />
      </section>

      <section>
        <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Proximos agentes
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <AgentCard
            icon={BarChart3}
            name="Agente de Cobranza"
            description="Ordena clientes por urgencia y sugiere a quien contactar primero."
            status="coming_soon"
          />
          <AgentCard
            icon={Wallet}
            name="Agente de Tesoreria"
            description="Revisa pagos, caja y compromisos para evitar sorpresas."
            status="coming_soon"
          />
          <AgentCard
            icon={ShieldCheck}
            name="Agente de Integridad de Datos"
            description="Explica si los datos estan actualizados y si hay problemas externos."
            status="coming_soon"
          />
        </div>
      </section>
    </div>
  );
}
