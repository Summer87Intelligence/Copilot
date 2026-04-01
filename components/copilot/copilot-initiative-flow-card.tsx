"use client";

import { CircleCheck, CircleDashed, Clock3, XCircle } from "lucide-react";

import type {
  InitiativeFlowItem,
  InitiativeFlowStatus,
} from "@/lib/ai/initiative-flow-types";
import { CopilotBadge, CopilotCard } from "@/components/copilot/copilot-ui";
import {
  mapActionChannel,
  mapActionTypeLabel,
  mapExecutionStatus,
} from "@/lib/copilot-format";

function statusTone(
  status: InitiativeFlowStatus
): "neutral" | "warning" | "danger" | "success" {
  switch (status) {
    case "new":
      return "neutral";
    case "decision_generated":
      return "warning";
    case "action_pending":
      return "warning";
    case "executed":
      return "success";
    case "with_outcome":
      return "success";
    case "closed_no_response":
      return "danger";
    default:
      return "neutral";
  }
}

function FlowIcon({ status }: { status: InitiativeFlowStatus }) {
  if (status === "with_outcome") {
    return <CircleCheck className="h-4 w-4 text-emerald-700" aria-hidden />;
  }
  if (status === "closed_no_response") {
    return <XCircle className="h-4 w-4 text-rose-700" aria-hidden />;
  }
  if (status === "action_pending") {
    return <Clock3 className="h-4 w-4 text-amber-700" aria-hidden />;
  }
  return <CircleDashed className="h-4 w-4 text-[var(--copilot-ink-muted)]" aria-hidden />;
}

function confidenceText(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function scoreText(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function CopilotInitiativeFlowCard({ item }: { item: InitiativeFlowItem }) {
  return (
    <CopilotCard className="space-y-4 border-[var(--copilot-border)] bg-white/85">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[var(--copilot-ink)]">
            {item.initiative.company_name || "Empresa (sin dato)"}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Trigger: {item.initiative.trigger || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg bg-[rgba(44,40,37,0.06)] px-2 py-1 text-xs font-medium text-[var(--copilot-ink-muted)]">
            <FlowIcon status={item.flow_status} />
            Score {scoreText(item.initiative.score)}
          </span>
          <CopilotBadge tone={statusTone(item.flow_status)}>
            {item.flow_status_label}
          </CopilotBadge>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Decisión
          </p>
          {item.decision ? (
            <div className="mt-2 space-y-1.5 text-sm text-[var(--copilot-ink)]">
              <p className="font-medium">
                {mapActionTypeLabel(item.decision.decision_type)}
              </p>
              <p className="text-[var(--copilot-ink-muted)]">
                Canal: {mapActionChannel(item.decision.recommended_channel)}
              </p>
              <p className="text-[var(--copilot-ink-muted)]">
                Confianza: {confidenceText(item.decision.confidence_score)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">Aún no generada.</p>
          )}
        </section>

        <section className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Acción
          </p>
          {item.action ? (
            <div className="mt-2 space-y-1.5 text-sm text-[var(--copilot-ink)]">
              <p className="font-medium">
                {mapActionTypeLabel(item.action.action_type)} ·{" "}
                {mapActionChannel(item.action.channel)}
              </p>
              <p className="text-[var(--copilot-ink-muted)]">
                Estado: {mapExecutionStatus(item.action.execution_status)}
              </p>
              <p className="line-clamp-2 text-[var(--copilot-ink-muted)]">
                {item.action.action_payload?.suggested_message || "Sin mensaje sugerido."}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">Pendiente de crear.</p>
          )}
        </section>

        <section className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Outcome
          </p>
          {item.outcome ? (
            <div className="mt-2 space-y-1.5 text-sm text-[var(--copilot-ink)]">
              <p className="font-medium">{item.outcome.outcome_type}</p>
              <p className="text-[var(--copilot-ink-muted)]">
                Categoría: {item.outcome.outcome_category}
              </p>
              <p className="text-[var(--copilot-ink-muted)]">
                Revenue:{" "}
                {item.outcome.revenue_amount == null
                  ? "—"
                  : item.outcome.revenue_amount.toLocaleString("es-AR")}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">Sin resultado registrado.</p>
          )}
        </section>
      </div>
    </CopilotCard>
  );
}
