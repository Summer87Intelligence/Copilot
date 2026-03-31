"use client";

import { Sparkles, Users } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotBadge, CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";

const PERFILES = [
  {
    id: "u1",
    role: "Admin operativo",
    scope: "Políticas, agentes y canales",
    limits: "Sin tope de envío en demo",
  },
  {
    id: "u2",
    role: "SDR / Ejecución",
    scope: "Acciones y mensajes en cola",
    limits: "Máx. 40 touchpoints / día",
  },
  {
    id: "u3",
    role: "Director",
    scope: "Lectura + aprobaciones sensibles",
    limits: "Solo vista y visto bueno",
  },
] as const;

export default function DemoIaPerfilesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="IA · Gobierno"
        title="Perfiles"
        description="Quién puede hacer qué dentro del sistema inteligente — roles, límites y alcance."
        right={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Demo
          </span>
        }
      />

      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
        <CopilotSectionTitle
          title="Roles de acceso"
          subtitle="Mock de permisos — sin autenticación real en esta demo."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {PERFILES.map((p) => (
            <CopilotCard key={p.id} className="border-amber-200/50 bg-white/90">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]">
                  <Users className="h-4 w-4" aria-hidden />
                </span>
                <p className="font-semibold text-[var(--copilot-ink)]">{p.role}</p>
              </div>
              <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">{p.scope}</p>
              <div className="mt-4">
                <CopilotBadge tone="warning">{p.limits}</CopilotBadge>
              </div>
            </CopilotCard>
          ))}
        </div>
      </div>
    </div>
  );
}
