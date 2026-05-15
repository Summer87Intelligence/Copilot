"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CopilotBadge, CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import type { ExecutiveBriefing } from "@/lib/copilot-executive-briefing-types";

function statusTone(status: ExecutiveBriefing["status"]): "neutral" | "warning" | "danger" | "success" {
  if (status === "critical") return "danger";
  if (status === "warning") return "warning";
  return "success";
}

function statusLabel(status: ExecutiveBriefing["status"]): string {
  if (status === "critical") return "Crítico";
  if (status === "warning") return "Alerta";
  return "Estable";
}

function StatusIcon({ status }: { status: ExecutiveBriefing["status"] }) {
  if (status === "critical" || status === "warning") {
    return (
      <AlertTriangle
        className={`h-4 w-4 shrink-0 ${status === "critical" ? "text-rose-600" : "text-amber-500"}`}
        aria-hidden
      />
    );
  }
  return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
}

function ConfidenceDot({ confidence }: { confidence: ExecutiveBriefing["confidence"] }) {
  const color =
    confidence === "high"
      ? "bg-emerald-500"
      : confidence === "medium"
        ? "bg-amber-400"
        : "bg-rose-400";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />;
}

function DoFirstItem({ item }: { item: ExecutiveBriefing["doFirst"][number] }) {
  const inner = (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] font-semibold leading-tight text-[var(--copilot-ink)]">
        {item.title}
      </span>
      <span className="text-[11px] text-[var(--copilot-ink-muted)]">{item.reason}</span>
    </div>
  );

  return (
    <li className="flex items-start gap-2 rounded-lg border border-[var(--copilot-border)]/60 bg-white/80 px-2.5 py-2">
      <span className="mt-px text-[10px] font-bold text-[var(--copilot-accent)]">→</span>
      <div className="min-w-0 flex-1">{inner}</div>
      {item.href ? (
        <Link
          href={item.href}
          className="shrink-0 rounded-md bg-[var(--copilot-accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent)]/20"
        >
          {item.actionLabel}
        </Link>
      ) : (
        <span className="shrink-0 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
          {item.actionLabel}
        </span>
      )}
    </li>
  );
}

function NeedsApprovalItem({ item }: { item: ExecutiveBriefing["needsApproval"][number] }) {
  const tone = item.riskLevel === "restricted" ? "danger" : "warning";
  const label = item.riskLevel === "restricted" ? "Restringida" : "Supervisada";

  return (
    <li className="flex items-start gap-2 rounded-lg border border-[var(--copilot-border)]/50 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-[var(--copilot-ink)]">{item.title}</p>
        <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">{item.reason}</p>
      </div>
      <CopilotBadge tone={tone}>{label}</CopilotBadge>
    </li>
  );
}

function BriefingCard({ briefing }: { briefing: ExecutiveBriefing }) {
  const [showEvidence, setShowEvidence] = useState(false);

  const hasDoFirst = briefing.doFirst.length > 0;
  const hasNeedsApproval = briefing.needsApproval.length > 0;
  const hasResolved = briefing.resolvedRecently.length > 0;
  const hasRisks = briefing.risksIncreasing.length > 0;

  return (
    <CopilotCard
      className={
        briefing.status === "critical"
          ? "border-rose-200/80 bg-rose-50/30"
          : briefing.status === "warning"
            ? "border-amber-200/70 bg-amber-50/20"
            : "border-[var(--copilot-border)] bg-white/95"
      }
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={briefing.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CopilotBadge tone={statusTone(briefing.status)}>
              {statusLabel(briefing.status)}
            </CopilotBadge>
            <span className="flex items-center gap-1 text-[10px] text-[var(--copilot-ink-muted)]">
              <ConfidenceDot confidence={briefing.confidence} />
              Confianza {briefing.confidence === "high" ? "alta" : briefing.confidence === "medium" ? "media" : "baja"}
            </span>
          </div>
          <p className="mt-1 text-[13px] font-semibold leading-snug text-[var(--copilot-ink)]">
            {briefing.headline}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{briefing.summary}</p>
        </div>
      </div>

      {briefing.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {briefing.evidence.map((ev) => (
            <span
              key={ev}
              className="rounded-full bg-[rgba(44,40,37,0.06)] px-2 py-0.5 text-[10px] text-[var(--copilot-ink-muted)]"
            >
              {ev}
            </span>
          ))}
        </div>
      ) : null}

      {hasDoFirst ? (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Hacer primero
          </p>
          <ul className="space-y-1.5">
            {briefing.doFirst.map((item) => (
              <DoFirstItem key={item.title} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      {hasNeedsApproval ? (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Requiere aprobación
          </p>
          <ul className="space-y-1.5">
            {briefing.needsApproval.map((item) => (
              <NeedsApprovalItem key={item.title} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      {briefing.whyItMatters.length > 0 ? (
        <div className="mt-3 rounded-lg bg-[var(--copilot-surface-muted)]/30 px-2.5 py-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            <Info className="h-3 w-3" aria-hidden />
            Por qué importa
          </p>
          <ul className="space-y-0.5">
            {briefing.whyItMatters.map((reason) => (
              <li key={reason} className="text-[11px] text-[var(--copilot-ink-muted)]">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(hasRisks || hasResolved) ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {hasRisks ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Riesgos en aumento
              </p>
              <ul className="space-y-0.5">
                {briefing.risksIncreasing.map((risk) => (
                  <li key={risk} className="text-[10px] text-amber-800">
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hasResolved ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Resuelto recientemente
              </p>
              <ul className="space-y-0.5">
                {briefing.resolvedRecently.map((item) => (
                  <li key={item} className="text-[10px] text-emerald-800">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {briefing.whatChanged.length > 0 ? (
        <div className="mt-2 border-t border-[var(--copilot-border)]/40 pt-2">
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] transition hover:text-[var(--copilot-ink)]"
          >
            {showEvidence ? (
              <ChevronUp className="h-3 w-3" aria-hidden />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden />
            )}
            Cambios recientes ({briefing.whatChanged.length})
          </button>
          {showEvidence ? (
            <p className="mt-1 text-[10px] text-[var(--copilot-ink-muted)]">
              {briefing.whatChanged.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </CopilotCard>
  );
}

export function RutasExecutiveBriefingSection() {
  const { executiveBriefing, loading } = useRutasOperationalFeedSnapshot();

  if (loading && !executiveBriefing) {
    return (
      <section className="space-y-1">
        <CopilotSectionTitle title="Briefing ejecutivo" subtitle="Resumen del estado operacional." />
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--copilot-border)]/20" />
      </section>
    );
  }

  if (!executiveBriefing) return null;

  return (
    <section className="space-y-1">
      <CopilotSectionTitle title="Briefing ejecutivo" subtitle="Resumen del estado operacional." />
      <BriefingCard briefing={executiveBriefing} />
    </section>
  );
}
