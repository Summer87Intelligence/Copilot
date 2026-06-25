import Link from "next/link";
import { Bot, CheckCircle2, Clock } from "lucide-react";

import { CopilotPremiumEmptyState } from "@/components/copilot/copilot-premium-empty-state";

/**
 * Placeholder de producto — sin motor de agentes activo en esta pantalla.
 */
export function AgentesComingSoonView() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-8 shadow-sm">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--copilot-accent)]/10">
            <Bot className="h-7 w-7 text-[var(--copilot-accent)]" aria-hidden />
          </div>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Próximamente
          </p>
          <h2 className="mt-4 text-[18px] font-semibold text-[var(--copilot-ink)]">
            Agentes IA en preparación
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
            Van a leer la misma información que ves en Hoy, Cartera y Tesorería para
            resumir riesgos, sugerir prioridades y explicar qué conviene hacer — sin
            modificar tus datos ni ejecutar pagos solos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Qué harán",
            text: "Leer deuda, caja, cobranza y alertas para ordenar el día en lenguaje claro.",
          },
          {
            title: "Cómo ayudarán",
            text: "Priorizar clientes, pagos y revisiones de caja con explicación del impacto esperado.",
          },
          {
            title: "Cuándo verás datos",
            text: "Cuando haya movimiento comercial sincronizado — igual que en Hoy y Dashboard.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 p-4"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">{item.title}</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
              {item.text}
            </p>
          </div>
        ))}
      </div>

      <CopilotPremiumEmptyState
        title="Módulo en preparación"
        why="Próxima etapa: agentes IA para alertas, resúmenes automáticos y recomendaciones coordinadas."
        whatToDo="Usá Hoy para la operación diaria y Cobranza para gestionar clientes mientras activamos los agentes."
        whatHappens="Cuando estén disponibles, vas a ver resúmenes coordinados acá sin cambiar tus procesos actuales."
        cta={{ label: "Ir a Hoy", href: "/copilot/hoy" }}
      />

      <p className="text-center text-xs text-[var(--copilot-ink-muted)]">
        ¿Necesitás analizar el negocio hoy?{" "}
        <Link href="/copilot/dashboard" className="font-semibold text-[var(--copilot-accent)] hover:underline">
          Abrir Dashboard Resumen
        </Link>
      </p>
    </div>
  );
}
