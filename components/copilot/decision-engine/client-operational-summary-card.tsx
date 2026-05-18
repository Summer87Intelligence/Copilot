"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  History,
  Loader2,
  UserMinus,
  UserPlus,
} from "lucide-react";

import type { ClientOperationalSummaryHydrated, OperationalTask } from "@/lib/decision-engine/de-types";
import { assigneeInitials } from "@/lib/decision-engine/client-operational-ownership-display";
import {
  BADGE_TONE_CLASS,
  buildOperationalBadges,
  compactImpactBullets,
  compactReasonChips,
} from "@/lib/decision-engine/client-operational-display";
import {
  resolveSummaryWorkflow,
  type WorkflowKind,
} from "@/lib/decision-engine/client-operational-workflow";
import { explainPriority } from "@/lib/decision-engine/ai/ai-priority-explainer";
import {
  computeRecoveryLikelihoodForSummary,
  formatRecoveryLikelihoodLine,
} from "@/lib/decision-engine/predictive/recovery-likelihood-engine";
import type { ClientOperationalHydrationRecord } from "@/lib/decision-engine/de-types";

export type ClientOperationalSummaryCardProps = {
  summary: ClientOperationalSummaryHydrated;
  seen?: boolean;
  completed?: boolean;
  actionLoading?: boolean;
  ownershipLoading?: boolean;
  focused?: boolean;
  currentUserId?: string | null;
  onExecuteWorkflow?: (task: OperationalTask, kind: WorkflowKind) => void;
  onMarkSeen?: (customerId: string) => void;
  onTakeOwnership?: (customerId: string) => void;
  onReleaseOwnership?: (customerId: string) => void;
  onAutoAssign?: (customerId: string) => void;
};

export function ClientOperationalSummaryCard({
  summary,
  seen = false,
  completed = false,
  actionLoading = false,
  ownershipLoading = false,
  focused = false,
  currentUserId = null,
  onExecuteWorkflow,
  onMarkSeen,
  onTakeOwnership,
  onReleaseOwnership,
  onAutoAssign,
}: ClientOperationalSummaryCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const badges = buildOperationalBadges(summary);
  const reasonChips = compactReasonChips(summary);
  const impactBullets = compactImpactBullets(summary);
  const workflow = resolveSummaryWorkflow(summary);
  const live = summary.live_state;
  const ownership = summary.live_ownership;
  const priorityExplanation = useMemo(() => {
    const hydration: ClientOperationalHydrationRecord = {
      customer_id: summary.customer_id,
      machine_state: summary.machine_state,
      previous_state: null,
      transitioned_at: live.transitioned_at,
      transition_reason: live.transition_reason,
      breached_sla: summary.live_sla.breached,
      next_follow_up_at: summary.live_follow_up.scheduled_for,
      pending_follow_up_id: summary.live_follow_up.id,
      pending_follow_up_reason: summary.live_follow_up.reason,
      last_action_at: null,
      last_action_type: null,
      last_action_summary: null,
      timeline_preview: summary.live_timeline,
      assigned_user_id: ownership.assigned_user_id,
      assigned_at: ownership.assigned_at,
      assigned_by: null,
      assignment_note: ownership.assignment_note,
      assignee_display_name: ownership.is_unassigned ? null : ownership.assignee_display_name,
    };
    return explainPriority({ summary, hydration });
  }, [summary, live, ownership]);

  const recoveryLikelihoodLine = useMemo(() => {
    const hydration: ClientOperationalHydrationRecord = {
      customer_id: summary.customer_id,
      machine_state: summary.machine_state,
      previous_state: null,
      transitioned_at: live.transitioned_at,
      transition_reason: live.transition_reason,
      breached_sla: summary.live_sla.breached,
      next_follow_up_at: summary.live_follow_up.scheduled_for,
      pending_follow_up_id: summary.live_follow_up.id,
      pending_follow_up_reason: summary.live_follow_up.reason,
      last_action_at: null,
      last_action_type: null,
      last_action_summary: null,
      timeline_preview: summary.live_timeline,
      assigned_user_id: ownership.assigned_user_id,
      assigned_at: ownership.assigned_at,
      assigned_by: null,
      assignment_note: ownership.assignment_note,
      assignee_display_name: ownership.is_unassigned ? null : ownership.assignee_display_name,
    };
    const likelihood = computeRecoveryLikelihoodForSummary(summary, hydration);
    return formatRecoveryLikelihoodLine(likelihood);
  }, [summary, live, ownership]);
  const timeline = summary.live_timeline;
  const canTake =
    Boolean(currentUserId && onTakeOwnership && (ownership.is_unassigned || !ownership.is_mine));
  const canRelease = Boolean(currentUserId && onReleaseOwnership && ownership.is_mine);

  const clientHref = `/copilot/clientes/${encodeURIComponent(summary.customer_id)}`;

  const handleCopy = useCallback(async () => {
    const text = [
      summary.customer_name,
      workflow.label,
      ...reasonChips.map((c) => c.label),
      ...impactBullets.map((b) => b.text),
      live.last_action_label,
      live.next_follow_up_label,
    ]
      .filter(Boolean)
      .join(" — ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [summary, workflow, reasonChips, impactBullets, live]);

  const runWorkflow = useCallback(
    (kind: WorkflowKind) => {
      onExecuteWorkflow?.(summary.primary_action, kind);
    },
    [onExecuteWorkflow, summary.primary_action]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== cardRef.current) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        router.push(clientHref);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c") {
        e.preventDefault();
        void handleCopy();
      } else if (k === "l") {
        e.preventDefault();
        runWorkflow("call");
      } else if (k === "p") {
        e.preventDefault();
        runWorkflow("promise");
      } else if (k === "e") {
        e.preventDefault();
        runWorkflow("escalate");
      } else if (k === "t" && canTake) {
        e.preventDefault();
        onTakeOwnership?.(summary.customer_id);
      } else if (k === "u" && canRelease) {
        e.preventDefault();
        onReleaseOwnership?.(summary.customer_id);
      } else if (k === "a" && onAutoAssign) {
        e.preventDefault();
        onAutoAssign(summary.customer_id);
      }
    },
    [
      router,
      clientHref,
      handleCopy,
      runWorkflow,
      canTake,
      canRelease,
      onTakeOwnership,
      onReleaseOwnership,
      onAutoAssign,
      summary.customer_id,
    ]
  );

  return (
    <article
      ref={cardRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`group rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-3 shadow-sm outline-none transition-all duration-200 hover:border-[var(--copilot-accent)]/40 focus-visible:ring-2 focus-visible:ring-[var(--copilot-accent)]/50 ${
        seen ? "opacity-55" : ""
      } ${completed ? "border-emerald-300 bg-emerald-50/30" : ""} ${
        focused ? "ring-2 ring-[var(--copilot-accent)]/60 border-[var(--copilot-accent)]/50" : ""
      } ${
        summary.actionable_now ? "border-l-[3px] border-l-rose-500" : "border-l-[3px] border-l-slate-200"
      } ${ownership.ownership_overdue ? "bg-rose-50/20" : ""}`}
    >
      {/* Header + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--copilot-text)] truncate leading-tight">
            {summary.customer_name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span
                key={b.id}
                className={`inline-flex rounded border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${BADGE_TONE_CLASS[b.tone]}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
        {summary.tasks_count > 1 && (
          <span className="shrink-0 text-[9px] text-[var(--copilot-text-muted)] tabular-nums">
            {summary.tasks_count} señales
          </span>
        )}
      </div>

      {/* Primary action — compact */}
      <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--copilot-text)] leading-tight">
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-accent)]" />
        <span className="truncate">{summary.primary_action.action_label}</span>
      </div>

      <div className="mt-2 rounded border border-teal-100 bg-teal-50/40 px-2 py-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-teal-800">
          Probabilidad de recuperación
        </p>
        <p className="text-[11px] text-[var(--copilot-text-secondary)] leading-snug mt-0.5">
          {recoveryLikelihoodLine}
        </p>
      </div>

      {/* AI priority explanation (complements score, does not replace) */}
      <div className="mt-2 rounded border border-indigo-100 bg-indigo-50/40 px-2 py-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-indigo-700">
          Por qué está priorizado
        </p>
        <p className="text-[11px] text-[var(--copilot-text-secondary)] leading-snug mt-0.5">
          {priorityExplanation.explanation}
        </p>
        {priorityExplanation.expected_outcome && (
          <p className="text-[10px] text-[var(--copilot-text-muted)] mt-0.5 truncate">
            {priorityExplanation.expected_outcome}
          </p>
        )}
      </div>

      {/* Reason chips */}
      {reasonChips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {reasonChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex rounded bg-[var(--copilot-surface-alt)] px-1.5 py-px text-[10px] font-medium text-[var(--copilot-text-secondary)]"
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}

      {/* Ownership */}
      <div className="mt-2 flex items-start gap-2 border-t border-[var(--copilot-border)]/60 pt-1.5">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            ownership.is_unassigned
              ? "bg-slate-100 text-slate-500"
              : ownership.is_mine
                ? "bg-[var(--copilot-accent)]/15 text-[var(--copilot-accent)]"
                : "bg-slate-200 text-slate-700"
          }`}
        >
          {ownership.is_unassigned ? "—" : assigneeInitials(ownership.assignee_display_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
              Responsable
            </span>
            {ownership.is_mine && (
              <span className="rounded bg-[var(--copilot-accent)] px-1 py-px text-[8px] font-bold uppercase text-white">
                Mío
              </span>
            )}
            {ownership.ownership_overdue && (
              <span className="rounded border border-rose-200 bg-rose-50 px-1 py-px text-[8px] font-semibold uppercase text-rose-700">
                SLA ownership
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-[var(--copilot-text)] truncate">
            {ownership.assignee_display_name}
          </p>
          <p className="text-[10px] text-[var(--copilot-text-muted)]">
            {ownership.ownership_status_label}
            {ownership.assigned_duration_label ? ` · ${ownership.assigned_duration_label}` : ""}
          </p>
        </div>
      </div>

      {/* Live operational state */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-[var(--copilot-text-muted)] border-t border-[var(--copilot-border)]/60 pt-1.5">
        <span className="col-span-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
          Estado operacional
        </span>
        <span>
          <span className="text-[var(--copilot-text-secondary)]">Última:</span>{" "}
          {live.last_action_label ?? "Sin acciones"}
        </span>
        <span>
          <span className="text-[var(--copilot-text-secondary)]">Próximo:</span>{" "}
          {live.next_follow_up_label ?? "—"}
        </span>
        <span>
          <span className="text-[var(--copilot-text-secondary)]">Estado:</span> {live.state_label}
        </span>
        <span>
          <span className="text-[var(--copilot-text-secondary)]">SLA:</span> {live.sla_label}
        </span>
        {live.transitioned_at && (
          <span className="col-span-2 text-[9px] text-[var(--copilot-text-muted)] truncate">
            Transición {new Date(live.transitioned_at).toLocaleDateString("es-UY")}
            {live.transition_reason ? ` · ${live.transition_reason}` : ""}
          </span>
        )}
      </div>

      {/* Timeline inline */}
      {timeline.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[10px] text-[var(--copilot-text-muted)]">
          {timeline.map((ev) => (
            <li key={ev.id} className="flex gap-1 truncate">
              <span className="text-[var(--copilot-text-secondary)]">•</span>
              <span className="truncate">{ev.summary}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Impact — compact bullets */}
      <div className="mt-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
          Impacto esperado
        </p>
        <ul className="mt-0.5 space-y-0">
          {impactBullets.map((b) => (
            <li key={b.id} className="text-[10px] text-[var(--copilot-text-secondary)] leading-snug">
              • {b.text}
            </li>
          ))}
        </ul>
      </div>

      {/* CTAs */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {canTake && (
          <button
            type="button"
            disabled={ownershipLoading}
            onClick={() => onTakeOwnership?.(summary.customer_id)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-accent)]/40 bg-[var(--copilot-accent)]/5 px-2 py-1 text-[11px] font-medium text-[var(--copilot-accent)] hover:bg-[var(--copilot-accent)]/10 disabled:opacity-50"
            title="Atajo: T"
          >
            {ownershipLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Tomar caso
          </button>
        )}
        {canRelease && (
          <button
            type="button"
            disabled={ownershipLoading}
            onClick={() => onReleaseOwnership?.(summary.customer_id)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-border)] px-2 py-1 text-[11px] text-[var(--copilot-text-muted)] hover:bg-[var(--copilot-surface-alt)] disabled:opacity-50"
            title="Atajo: U"
          >
            <UserMinus className="h-3 w-3" />
            Liberar
          </button>
        )}
        {onAutoAssign && ownership.is_unassigned && (
          <button
            type="button"
            disabled={ownershipLoading}
            onClick={() => onAutoAssign(summary.customer_id)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--copilot-text-muted)] hover:underline disabled:opacity-50"
            title="Atajo: A"
          >
            Auto-asignar
          </button>
        )}
        {onExecuteWorkflow && (
          <button
            type="button"
            disabled={actionLoading || completed}
            onClick={() => runWorkflow(workflow.kind)}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--copilot-accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {actionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : completed ? (
              <Check className="h-3 w-3" />
            ) : null}
            {completed ? "Registrado" : workflow.label}
          </button>
        )}
        <Link
          href={clientHref}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-border)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--copilot-surface-alt)]"
        >
          <ExternalLink className="h-3 w-3" />
          Ver cliente
        </Link>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-border)] px-2 py-1 text-[11px] text-[var(--copilot-text-muted)] hover:bg-[var(--copilot-surface-alt)]"
          title="Atajo: C"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        {timeline.length > 0 && (
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--copilot-text-muted)] hover:underline"
            title="Ver historial en cliente"
          >
            <History className="h-3 w-3" />
            Historial
          </button>
        )}
        {onMarkSeen && !seen && !completed && (
          <button
            type="button"
            onClick={() => onMarkSeen(summary.customer_id)}
            className="text-[10px] text-[var(--copilot-text-muted)] hover:underline ml-auto"
          >
            Visto
          </button>
        )}
      </div>
      {historyOpen && (
        <p className="mt-1 text-[10px] text-[var(--copilot-text-muted)]">
          Historial completo en ficha de cliente.
        </p>
      )}
    </article>
  );
}
