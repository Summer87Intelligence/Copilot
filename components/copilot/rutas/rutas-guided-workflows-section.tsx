"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { compareWorkflowPriority } from "@/lib/copilot-operational-workflow-scoring";
import type {
  OperationalWorkflowExecution,
  WorkflowExecutionStep,
} from "@/lib/copilot-operational-workflows-types";

type OperatorMe = {
  id: string;
  full_name: string;
  email: string;
};

const STATUS_LABEL: Record<OperationalWorkflowExecution["status"], string> = {
  active: "Activo",
  blocked: "Bloqueado",
  completed: "Completado",
  cancelled: "Cancelado",
};

function statusTone(
  status: OperationalWorkflowExecution["status"]
): "neutral" | "warning" | "danger" | "success" {
  if (status === "blocked") return "danger";
  if (status === "completed") return "success";
  if (status === "cancelled") return "neutral";
  return "warning";
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const deltaMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.round(deltaMs / 60_000);
    if (minutes < 1) return "ahora";
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return `hace ${days} d`;
  } catch {
    return iso;
  }
}

function stepStatusLabel(status: WorkflowExecutionStep["status"]): string {
  if (status === "pending") return "Pendiente";
  if (status === "active") return "Activo";
  if (status === "blocked") return "Bloqueado";
  if (status === "completed") return "Completado";
  return "Omitido";
}

function WorkflowStepRow({ step }: { step: WorkflowExecutionStep }) {
  return (
    <li className="rounded-md border border-[var(--copilot-border)]/70 bg-white/70 px-2 py-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <CopilotBadge tone="neutral">{stepStatusLabel(step.status)}</CopilotBadge>
        <span className="font-medium text-[var(--copilot-ink)]">{step.title}</span>
        {step.ownerLabel ? (
          <span className="text-[var(--copilot-ink-muted)]">· {step.ownerLabel}</span>
        ) : null}
        {step.activatedAt ? (
          <span className="text-[var(--copilot-ink-muted)]">
            · {formatRelativeTime(step.activatedAt)}
          </span>
        ) : null}
      </div>
      {step.blockedReason ? (
        <p className="mt-0.5 text-[10px] text-rose-800">{step.blockedReason}</p>
      ) : null}
    </li>
  );
}

function GuidedWorkflowCard({
  workflow,
  busy,
  expanded,
  assignedToMe,
  onToggle,
  onCompleteStep,
  onBlock,
  onUnblock,
  onCancel,
  onAssignMe,
}: {
  workflow: OperationalWorkflowExecution;
  busy: boolean;
  expanded: boolean;
  assignedToMe: boolean;
  onToggle: () => void;
  onCompleteStep: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onCancel: () => void;
  onAssignMe: () => void;
}) {
  const currentHref =
    workflow.steps.find((step) => step.stepId === workflow.currentStepId)?.metadata?.href;

  return (
    <CopilotCard className="border border-[var(--copilot-border)]/80 bg-white/80 px-2.5 py-2 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CopilotBadge tone={statusTone(workflow.status)}>{STATUS_LABEL[workflow.status]}</CopilotBadge>
            {workflow.isOverdue ? <CopilotBadge tone="warning">Vencido</CopilotBadge> : null}
          </div>
          <p className="mt-1 text-[13px] font-semibold text-[var(--copilot-ink)]">{workflow.title}</p>
          {/* step progress bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-[var(--copilot-border)]/30">
              <div
                className="h-1 rounded-full bg-[var(--copilot-accent)] transition-all"
                style={{ width: `${workflow.progressPercent}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] font-semibold text-[var(--copilot-ink-muted)]">
              {workflow.progressPercent}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
            {workflow.currentStepTitle ? `Ahora: ${workflow.currentStepTitle}` : "Sin paso activo"}
            {assignedToMe
              ? " · Tuya"
              : workflow.ownerLabel
                ? ` · ${workflow.ownerLabel}`
                : " · Sin responsable"}
          </p>
        </div>
        {typeof currentHref === "string" ? (
          <Link
            href={currentHref}
            className="shrink-0 text-[10px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 hover:text-[var(--copilot-ink)] hover:underline"
          >
            Ver detalle
          </Link>
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <CopilotGhostButton
          type="button"
          disabled={busy || workflow.status === "completed" || workflow.status === "cancelled"}
          className="px-2 py-1 text-[10px]"
          onClick={onCompleteStep}
        >
          Completar paso
        </CopilotGhostButton>
        <CopilotGhostButton
          type="button"
          disabled={
            busy ||
            assignedToMe ||
            workflow.status === "completed" ||
            workflow.status === "cancelled"
          }
          className="px-2 py-1 text-[10px]"
          onClick={onAssignMe}
        >
          {assignedToMe ? "Asignada a vos" : "Asignarme"}
        </CopilotGhostButton>
        {workflow.status === "blocked" ? (
          <CopilotGhostButton
            type="button"
            disabled={busy}
            className="px-2 py-1 text-[10px]"
            onClick={onUnblock}
          >
            Desbloquear
          </CopilotGhostButton>
        ) : (
          <CopilotGhostButton
            type="button"
            disabled={busy || workflow.status === "completed" || workflow.status === "cancelled"}
            className="px-2 py-1 text-[10px]"
            onClick={onBlock}
          >
            Bloquear
          </CopilotGhostButton>
        )}
        <CopilotGhostButton
          type="button"
          disabled={busy || workflow.status === "completed"}
          className="px-2 py-1 text-[10px]"
          onClick={onCancel}
        >
          Cancelar
        </CopilotGhostButton>
        <CopilotGhostButton
          type="button"
          className="px-2 py-1 text-[10px]"
          onClick={onToggle}
        >
          {expanded ? "Ocultar pasos" : "Ver pasos"}
        </CopilotGhostButton>
      </div>

      {expanded ? (
        <ul className="mt-2 space-y-1 border-t border-[var(--copilot-border)]/60 pt-2">
          {workflow.steps.map((step) => (
            <WorkflowStepRow key={step.stepId} step={step} />
          ))}
        </ul>
      ) : null}
    </CopilotCard>
  );
}

export function RutasGuidedWorkflowsSection() {
  const { workflows, loading, refresh } = useRutasOperationalFeedSnapshot();
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyWorkflowId, setBusyWorkflowId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [operator, setOperator] = useState<OperatorMe | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/me");
        const json = (await res.json()) as { appUser?: OperatorMe };
        if (res.ok && json.appUser) setOperator(json.appUser);
      } catch {
        /* asignación opcional */
      }
    })();
  }, []);

  const preview = useMemo(
    () =>
      workflows
        .filter((workflow) => workflow.status === "active" || workflow.status === "blocked")
        .sort(compareWorkflowPriority),
    [workflows]
  );

  const mutateWorkflow = async (
    workflow: OperationalWorkflowExecution,
    body: Record<string, unknown>,
    _optimistic: OperationalWorkflowExecution,
    successMessage: string
  ) => {
    setBusyWorkflowId(workflow.id);
    setFeedback(null);
    setFeedback(successMessage);
    try {
      const res = await copilotApiFetch(`/api/copilot/operational-workflows/${workflow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        setFeedback(null);
        setError(json.message ?? "No se pudo actualizar el workflow.");
        return;
      }
      await refresh({ fresh: true, silent: true });
    } catch {
      setFeedback(null);
      setError("Error de red al actualizar el workflow.");
    } finally {
      setBusyWorkflowId(null);
    }
  };

  if (!loading && preview.length === 0 && !error) {
    return null;
  }

  return (
    <section className="space-y-1">
      <CopilotSectionTitle
        title="Paso a paso"
        subtitle="Seguí el progreso de cada tarea en curso."
      />

      {error ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {feedback ? (
        <p className="text-[11px] text-emerald-900" role="status">
          {feedback}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Preparando paso a paso…
        </div>
      ) : (
        <ul className="space-y-1">
          {preview.map((workflow) => (
            <li key={workflow.id}>
              <GuidedWorkflowCard
                workflow={workflow}
                busy={busyWorkflowId === workflow.id}
                expanded={expandedIds.has(workflow.id)}
                assignedToMe={
                  Boolean(operator?.id) &&
                  (workflow.assignedUserId === operator?.id ||
                    workflow.ownerLabel === operator?.full_name?.trim() ||
                    workflow.ownerLabel === operator?.email)
                }
                onToggle={() =>
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(workflow.id)) next.delete(workflow.id);
                    else next.add(workflow.id);
                    return next;
                  })
                }
                onCompleteStep={() => {
                  if (!workflow.currentStepId) return;
                  void mutateWorkflow(
                    workflow,
                    { action: "complete_step", stepId: workflow.currentStepId },
                    {
                      ...workflow,
                      progressPercent: Math.min(
                        100,
                        workflow.progressPercent + Math.round(100 / workflow.steps.length)
                      ),
                    },
                    "Paso completado."
                  );
                }}
                onBlock={() =>
                  void mutateWorkflow(
                    workflow,
                    { action: "block" },
                    { ...workflow, status: "blocked" },
                    "Workflow bloqueado."
                  )
                }
                onUnblock={() =>
                  void mutateWorkflow(
                    workflow,
                    { action: "unblock" },
                    { ...workflow, status: "active" },
                    "Workflow desbloqueado."
                  )
                }
                onCancel={() =>
                  void mutateWorkflow(
                    workflow,
                    { action: "cancel" },
                    { ...workflow, status: "cancelled" },
                    "Workflow cancelado."
                  )
                }
                onAssignMe={() => {
                  const label = operator?.full_name?.trim() || operator?.email;
                  if (!label) {
                    setError("No se pudo resolver el usuario actual para asignar.");
                    return;
                  }
                  void mutateWorkflow(
                    workflow,
                    {
                      action: "assign",
                      assigned_to: label,
                      owner_label: label,
                      assigned_user_id: operator?.id ?? null,
                    },
                    { ...workflow, ownerLabel: label, assignedUserId: operator?.id ?? null },
                    "Responsable asignado."
                  );
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
