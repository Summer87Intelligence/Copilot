"use client";

import { useState } from "react";
import {
  Bell,
  MessageCircle,
  Radio,
  Shield,
  SlidersHorizontal,
  Sparkles,
  UserCog,
} from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";

const AGENT_PRIORITY = [
  { id: "dec", label: "Decisor comercial", weight: 1 },
  { id: "diag", label: "Diagnóstico", weight: 2 },
  { id: "inv", label: "Investigador", weight: 3 },
  { id: "opt", label: "Optimizador", weight: 4 },
  { id: "sup", label: "Supervisor", weight: 5 },
] as const;

const CHANNELS = [
  { id: "wa", label: "WhatsApp", on: true },
  { id: "li", label: "LinkedIn", on: true },
  { id: "em", label: "Email", on: true },
  { id: "vo", label: "Voz / call", on: false },
] as const;

export default function DemoIaConfiguracionPage() {
  const [autonomy, setAutonomy] = useState(72);
  const [mode, setMode] = useState<"asistido" | "mixto" | "autonomo">("mixto");
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="IA · Sistema"
        title="Configuración"
        description="Parámetros del sistema operativo inteligente: autonomía, modos, canales y políticas de supervisión — pensado para gobierno, no para formularios sueltos."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Demo
            </span>
            <CopilotPrimaryButton
              type="button"
              onClick={() => {
                setSaved(true);
                window.setTimeout(() => setSaved(false), 2400);
              }}
              className="inline-flex items-center gap-2"
            >
              <Shield className="h-4 w-4" aria-hidden />
              {saved ? "Política guardada (demo)" : "Guardar política (demo)"}
            </CopilotPrimaryButton>
          </div>
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        {saved ? (
          <p
            role="status"
            className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950"
          >
            Cambios aplicados en memoria — sin persistencia ni Supabase.
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <CopilotCard className="border-amber-200/55 bg-gradient-to-br from-white via-amber-50/25 to-white">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/90 text-amber-900 ring-1 ring-amber-200/80">
                <SlidersHorizontal className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                  Autonomía global
                </h2>
                <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                  Cuánto puede avanzar el sistema sin pedir confirmación explícita.
                </p>
                <div className="mt-5">
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {autonomy}%
                    </p>
                    <CopilotBadge tone="warning">Supervisado</CopilotBadge>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={autonomy}
                    onChange={(e) => setAutonomy(Number(e.target.value))}
                    className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(44,40,37,0.12)] accent-[var(--copilot-accent)]"
                    aria-label="Autonomía global"
                  />
                  <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                    Por encima del 80% se recomienda reforzar reglas de contacto y
                    descuentos.
                  </p>
                </div>
              </div>
            </div>
          </CopilotCard>

          <CopilotCard>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.2)]">
                <Radio className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                  Modo de operación
                </h2>
                <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                  Define el balance entre velocidad y control humano.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(
                    [
                      { id: "asistido" as const, label: "Asistido", hint: "Sugerencias" },
                      { id: "mixto" as const, label: "Mixto", hint: "Recomendado" },
                      { id: "autonomo" as const, label: "Autónomo", hint: "Alto riesgo" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                        mode === m.id
                          ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent-soft)] text-[var(--copilot-ink)] ring-1 ring-[rgba(31,107,74,0.2)]"
                          : "border-[var(--copilot-border)] bg-white/80 text-[var(--copilot-ink-muted)] hover:border-[rgba(31,107,74,0.25)]"
                      }`}
                    >
                      {m.label}
                      <span className="mt-0.5 block text-[11px] font-normal opacity-80">
                        {m.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CopilotCard>
        </div>

        <CopilotCard>
          <CopilotSectionTitle
            title="Prioridad de agentes"
            subtitle="Orden de influencia cuando hay conflicto entre recomendaciones."
          />
          <ul className="space-y-2">
            {AGENT_PRIORITY.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--copilot-border)] bg-white/80 px-4 py-3"
              >
                <span className="text-sm font-medium text-[var(--copilot-ink)]">
                  {a.weight}. {a.label}
                </span>
                <div className="flex gap-2">
                  <CopilotGhostButton type="button" className="text-xs">
                    Subir
                  </CopilotGhostButton>
                  <CopilotGhostButton type="button" className="text-xs">
                    Bajar
                  </CopilotGhostButton>
                </div>
              </li>
            ))}
          </ul>
        </CopilotCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <CopilotCard>
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[var(--copilot-accent)]" aria-hidden />
              <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                Reglas de supervisión
              </h2>
            </div>
            <ul className="space-y-3 text-sm text-[var(--copilot-ink-muted)]">
              <li className="flex gap-2 rounded-lg bg-[rgba(44,40,37,0.04)] px-3 py-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                Mensajes con monto o descuento {'>'} 8% requieren aprobación.
              </li>
              <li className="flex gap-2 rounded-lg bg-[rgba(44,40,37,0.04)] px-3 py-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                Cuentas enterprise siempre en modo supervisado.
              </li>
              <li className="flex gap-2 rounded-lg bg-[rgba(44,40,37,0.04)] px-3 py-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                Fuera de horario comercial: solo borradores, sin envío.
              </li>
            </ul>
          </CopilotCard>

          <CopilotCard>
            <div className="mb-4 flex items-center gap-2">
              <UserCog className="h-5 w-5 text-[var(--copilot-ink-muted)]" aria-hidden />
              <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                Fallback humano
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
              Si el modelo baja de umbral de confianza o hay incoherencia con CRM, el
              sistema detiene el envío y asigna a un owner humano con contexto
              embebido.
            </p>
            <div className="mt-4 rounded-xl border border-dashed border-amber-300/70 bg-amber-50/50 px-3 py-2 text-xs font-medium text-amber-950">
              Demo: sin enrutamiento real — solo visualización de política.
            </div>
          </CopilotCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <CopilotCard>
            <CopilotSectionTitle
              title="Canales habilitados"
              subtitle="Dónde puede actuar el sistema en este entorno."
            />
            <ul className="space-y-2">
              {CHANNELS.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--copilot-border)] bg-white/80 px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-[var(--copilot-ink)]">
                    <MessageCircle className="h-4 w-4 text-[var(--copilot-ink-muted)]" />
                    {c.label}
                  </span>
                  <CopilotBadge tone={c.on ? "success" : "neutral"}>
                    {c.on ? "Activo" : "Off"}
                  </CopilotBadge>
                </li>
              ))}
            </ul>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle
              title="Alertas críticas"
              subtitle="Eventos que cortan autonomía y notifican al equipo."
            />
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3 text-rose-950">
                <span className="flex items-center gap-2 font-medium">
                  <Bell className="h-4 w-4" />
                  Caída de integración CRM
                </span>
                <CopilotBadge tone="danger">Escalación</CopilotBadge>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-amber-950">
                <span className="flex items-center gap-2 font-medium">
                  <Bell className="h-4 w-4" />
                  Política de contacto violada
                </span>
                <CopilotBadge tone="warning">Revisión</CopilotBadge>
              </li>
            </ul>
            <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
              Política de intervención: ante alerta crítica, el sistema pasa a modo
              asistido hasta ack explícito del admin.
            </p>
          </CopilotCard>
        </div>
      </div>
    </div>
  );
}
