"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  CircleDot,
  Loader2,
  RefreshCw,
  TriangleAlert,
  ArrowRight,
} from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { ExecutiveBriefingApiResponse } from "@/lib/copilot-executive-briefing-types";
import type { NotificationListResponse } from "@/lib/copilot-notifications/notification-types";
import {
  buildDailyExecutiveBrief,
  type DailyExecutiveBrief,
} from "@/lib/copilot-agents/build-daily-executive-brief";
import { AgentCard } from "./agent-card";
import { AgentPriorityCard } from "./agent-priority-card";

// ─── Status banner ────────────────────────────────────────────────────────────

// Banner premium: card neutra con acento sólo en borde + ícono + badge.
// Evita teñir grandes superficies (sensación SaaS B2B).
const STATUS_CONFIG = {
  stable: {
    icon: CheckCircle2,
    iconCls: "text-[var(--copilot-success-text)]",
    label: "Estable",
    badgeCls: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border border-[var(--copilot-success-border)]",
    bannerCls: "bg-[var(--copilot-card-bg)] border-[var(--copilot-success-border)]",
  },
  attention: {
    icon: CircleDot,
    iconCls: "text-[var(--copilot-warning-text)]",
    label: "En atención",
    badgeCls: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border border-[var(--copilot-warning-border)]",
    bannerCls: "bg-[var(--copilot-card-bg)] border-[var(--copilot-warning-border)]",
  },
  critical: {
    icon: TriangleAlert,
    iconCls: "text-[var(--copilot-danger-text)]",
    label: "Crítico",
    badgeCls: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border border-[var(--copilot-danger-border)]",
    bannerCls: "bg-[var(--copilot-card-bg)] border-[var(--copilot-danger-border)]",
  },
};

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "ahora mismo";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  return `hace ${Math.floor(diff / 3600)} h`;
}

// ─── Brief result view ────────────────────────────────────────────────────────

function BriefResult({
  brief,
  onRegenerate,
}: {
  brief: DailyExecutiveBrief;
  onRegenerate: () => void;
}) {
  const cfg = STATUS_CONFIG[brief.status];
  const StatusIcon = cfg.icon;

  return (
    <div className="space-y-5">
      {/* A) Resumen ejecutivo */}
      <div className={`flex items-start gap-3 rounded-xl border p-4 ${cfg.bannerCls}`}>
        <StatusIcon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.iconCls}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold text-[var(--copilot-ink)]">
              Estado del negocio
            </p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${cfg.badgeCls}`}>
              {cfg.label}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
            {brief.summary}
          </p>
        </div>
      </div>

      {/* B) Prioridades del día */}
      {brief.priorities.length > 0 ? (
        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Prioridades del día
          </p>
          <div className="space-y-2.5">
            {brief.priorities.map((p, i) => (
              <AgentPriorityCard key={p.id} priority={p} index={i} />
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-[var(--copilot-border)]/60 bg-[rgba(44,40,37,0.02)] px-5 py-4 text-center">
          <p className="text-[13px] font-semibold text-[var(--copilot-ink)]">
            Sin prioridades urgentes
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--copilot-ink-muted)]">
            Todo en orden por ahora.
          </p>
        </div>
      )}

      {/* C) Qué cambió */}
      <section>
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Qué cambió desde la última actualización
        </p>
        <ul className="space-y-1.5">
          {brief.changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--copilot-ink-muted)]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-ink-muted)]/40" />
              {c}
            </li>
          ))}
        </ul>
      </section>

      {/* D) Próximo paso recomendado */}
      <section className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(31,107,74,0.03)] p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Próximo paso recomendado
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-[var(--copilot-ink)]">
            {brief.nextBestAction.label}
          </p>
          <Link
            href={brief.nextBestAction.href}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Ir ahora
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Footer: timestamp + regenerar */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-[var(--copilot-ink-muted)]/60">
          Generado {relativeTime(brief.generatedAt)}
        </p>
        <button
          type="button"
          onClick={onRegenerate}
          className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--copilot-accent)] transition-opacity hover:opacity-75"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Actualizar
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type LoadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; brief: DailyExecutiveBrief }
  | { phase: "error"; message: string };

async function fetchBrief(): Promise<DailyExecutiveBrief> {
  const [briefingRes, notifRes] = await Promise.all([
    copilotApiFetch("/api/copilot/executive-briefing"),
    copilotApiFetch("/api/copilot/notifications?limit=30"),
  ]);

  const briefingData: ExecutiveBriefingApiResponse = await briefingRes.json();
  const notifData: NotificationListResponse = await notifRes.json();

  const briefing = briefingData.ok ? briefingData.briefing : null;
  const notifications = notifData.ok ? notifData.notifications : [];

  return buildDailyExecutiveBrief(briefing, notifications);
}

export function DailyExecutiveAgent() {
  const [state, setState] = useState<LoadState>({ phase: "idle" });

  const generate = () => {
    setState({ phase: "loading" });
    fetchBrief()
      .then((brief) => setState({ phase: "done", brief }))
      .catch((err) =>
        setState({
          phase: "error",
          message:
            err instanceof Error ? err.message : "Error al generar resumen.",
        })
      );
  };

  return (
    <AgentCard
      icon={Bot}
      name="Agente Ejecutivo Diario"
      description="Lee caja, cartera, pagos, alertas y estado operacional para generar un resumen simple de prioridades."
      status="active"
      ctaLabel={state.phase === "done" ? undefined : "Generar resumen de hoy"}
      onCta={state.phase === "loading" ? undefined : generate}
    >
      {/* Loading */}
      {state.phase === "loading" ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--copilot-accent)]" />
          <p className="text-[12.5px] text-[var(--copilot-ink-muted)]">
            Analizando tu negocio...
          </p>
        </div>
      ) : null}

      {/* Error */}
      {state.phase === "error" ? (
        <div className="space-y-3 text-center">
          <p className="text-[12.5px] text-[var(--copilot-danger-text)]">{state.message}</p>
          <button
            type="button"
            onClick={generate}
            className="text-[12px] font-medium text-[var(--copilot-accent)] underline underline-offset-2"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {/* Result */}
      {state.phase === "done" ? (
        <>
          <BriefResult brief={state.brief} onRegenerate={generate} />
          <div className="mt-4 border-t border-[var(--copilot-border)]/60 pt-3">
            <button
              type="button"
              onClick={generate}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Generar nuevo resumen
            </button>
          </div>
        </>
      ) : null}

      {/* Idle — show the CTA via AgentCard above; nothing extra needed */}
    </AgentCard>
  );
}
