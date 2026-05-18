"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  History,
  Loader2,
} from "lucide-react";

import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { ClientOperationalSummary, DECollectionAction, OperationalTask } from "@/lib/decision-engine/de-types";
import {
  BADGE_TONE_CLASS,
  buildOperationalBadges,
  compactImpactBullets,
  compactReasonChips,
} from "@/lib/decision-engine/client-operational-display";
import {
  buildClientOperationalLiveState,
  buildTimelineForCustomer,
  type TimelineEvent,
} from "@/lib/decision-engine/client-operational-execution-context";
import {
  resolveSummaryWorkflow,
  type WorkflowKind,
} from "@/lib/decision-engine/client-operational-workflow";

export type ClientOperationalSummaryCardProps = {
  summary: ClientOperationalSummary;
  customerActions?: Array<CollectionAction | DECollectionAction>;
  seen?: boolean;
  completed?: boolean;
  actionLoading?: boolean;
  onExecuteWorkflow?: (task: OperationalTask, kind: WorkflowKind) => void;
  onMarkSeen?: (customerId: string) => void;
};

export function ClientOperationalSummaryCard({
  summary,
  customerActions = [],
  seen = false,
  completed = false,
  actionLoading = false,
  onExecuteWorkflow,
  onMarkSeen,
}: ClientOperationalSummaryCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const badges = buildOperationalBadges(summary);
  const reasonChips = compactReasonChips(summary);
  const impactBullets = compactImpactBullets(summary);
  const workflow = resolveSummaryWorkflow(summary);
  const live = buildClientOperationalLiveState(summary, customerActions);
  const timeline: TimelineEvent[] = buildTimelineForCustomer(
    summary.customer_id,
    customerActions,
    3
  );

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
      }
    },
    [router, clientHref, handleCopy, runWorkflow]
  );

  return (
    <article
      ref={cardRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`group rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-3 shadow-sm outline-none transition-all duration-200 hover:border-[var(--copilot-accent)]/40 focus-visible:ring-2 focus-visible:ring-[var(--copilot-accent)]/50 ${
        seen ? "opacity-55" : ""
      } ${completed ? "border-emerald-300 bg-emerald-50/30" : ""} ${
        summary.actionable_now ? "border-l-[3px] border-l-rose-500" : "border-l-[3px] border-l-slate-200"
      }`}
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
      </div>

      {/* Timeline inline */}
      {timeline.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[10px] text-[var(--copilot-text-muted)]">
          {timeline.map((ev) => (
            <li key={ev.id} className="flex gap-1 truncate">
              <span className="text-[var(--copilot-text-secondary)]">•</span>
              <span className="truncate">{ev.label}</span>
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
