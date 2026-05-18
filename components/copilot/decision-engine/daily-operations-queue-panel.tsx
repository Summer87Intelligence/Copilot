"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Phone,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import type {
  DailyOperationsQueue,
  OperationalTask,
  QueueSection,
} from "@/lib/decision-engine/de-types";
import { RISK_LEVEL_LABELS, TASK_CATEGORY_LABELS } from "@/lib/decision-engine/de-types";
import {
  allSectionsWithTasks,
  getSectionTasks,
  isCacheStale,
  isQueueEmpty,
  operationalConfidenceScore,
  sectionLabel,
  sliceVisibleTasks,
} from "@/lib/decision-engine/daily-operations-queue-panel.helpers";

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-rose-100 text-rose-800 border-rose-200",
  high: "bg-orange-50 text-orange-800 border-orange-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

const IMPACT_STYLES: Record<string, string> = {
  critical: "text-rose-600",
  high: "text-orange-600",
  medium: "text-amber-600",
  low: "text-slate-500",
};

const SOURCE_LABELS: Record<string, string> = {
  state_machine: "Estado",
  sla_engine: "SLA",
  risk_ranker: "Riesgo",
  portfolio: "Cartera",
  follow_up: "Seguimiento",
  automated: "Auto",
};

const SECTION_ACCENT: Record<QueueSection, string> = {
  urgent_today: "border-l-rose-500",
  high_impact: "border-l-orange-400",
  this_week: "border-l-amber-400",
  monitoring: "border-l-slate-300",
  automated: "border-l-emerald-400",
};

const SEEN_STORAGE_KEY = "copilot_de_queue_seen_v1";

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

type TaskCardProps = {
  task: OperationalTask;
  seen: boolean;
  onRegisterAction?: (task: OperationalTask) => void;
  onMarkSeen?: (taskId: string) => void;
};

function TaskCard({ task, seen, onRegisterAction, onMarkSeen }: TaskCardProps) {
  const [copied, setCopied] = useState(false);
  const dueLabel = formatDate(task.due_at);
  const confidence = operationalConfidenceScore(task);
  const priorityStyle = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium!;

  async function handleCopy() {
    const text = [task.company_name, task.action_label, task.reason, dueLabel ? `Vence: ${dueLabel}` : null]
      .filter(Boolean)
      .join(" — ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <article
      className={`rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-3.5 shadow-sm border-l-[3px] transition-opacity ${
        seen ? "opacity-60" : ""
      } ${SECTION_ACCENT[task.section]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <TaskCardBadges task={task} priorityStyle={priorityStyle} />
        <span className="shrink-0 text-[10px] font-mono text-[var(--copilot-text-muted)] tabular-nums">
          {task.priority_score}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-[var(--copilot-text)] leading-snug">{task.action_label}</p>
      <p className="mt-1 text-xs text-[var(--copilot-text-secondary)] leading-relaxed">{task.reason}</p>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--copilot-text-muted)]">
        <span className={IMPACT_STYLES[task.impact] ?? ""}>Impacto {task.impact}</span>
        <span>·</span>
        <span>{formatCurrency(task.pending_amount, task.currency_code)}</span>
        <span>·</span>
        <span>{RISK_LEVEL_LABELS[task.risk_level]}</span>
        {dueLabel && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5">
              <CalendarClock className="h-3 w-3" />
              {dueLabel}
            </span>
          </>
        )}
        <span>·</span>
        <span>Fuente: {SOURCE_LABELS[task.source] ?? task.source}</span>
        <span>·</span>
        <span>Confianza operativa {confidence}%</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onRegisterAction && (
          <button
            type="button"
            onClick={() => onRegisterAction(task)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--copilot-accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Phone className="h-3.5 w-3.5" />
            Registrar acción
          </button>
        )}
        <Link
          href={`/copilot/clientes/${encodeURIComponent(task.customer_id)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--copilot-surface-alt)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ver cliente
        </Link>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2 py-1.5 text-xs text-[var(--copilot-text-muted)] hover:bg-[var(--copilot-surface-alt)]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        {onMarkSeen && !seen && (
          <button
            type="button"
            onClick={() => onMarkSeen(task.id)}
            className="text-xs text-[var(--copilot-text-muted)] hover:underline"
          >
            Marcar visto
          </button>
        )}
      </div>
    </article>
  );
}

function TaskCardBadges({ task, priorityStyle }: { task: OperationalTask; priorityStyle: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
      <span className="text-sm font-semibold text-[var(--copilot-text)] truncate">{task.company_name}</span>
      <span
        className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${priorityStyle}`}
      >
        {task.priority}
      </span>
      <span className="inline-flex rounded-full bg-[var(--copilot-surface-alt)] px-1.5 py-0.5 text-[10px] text-[var(--copilot-text-muted)]">
        {TASK_CATEGORY_LABELS[task.category]}
      </span>
    </div>
  );
}

type QueueSectionBlockProps = {
  section: QueueSection;
  tasks: OperationalTask[];
  seenIds: Set<string>;
  onRegisterAction?: (task: OperationalTask) => void;
  onMarkSeen: (taskId: string) => void;
};

function QueueSectionBlock({ section, tasks, seenIds, onRegisterAction, onMarkSeen }: QueueSectionBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const { visible, hiddenCount } = sliceVisibleTasks(tasks, expanded);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
          {sectionLabel(section)}
          <span className="ml-1.5 font-normal normal-case text-[var(--copilot-text-secondary)]">
            ({tasks.length})
          </span>
        </h3>
      </div>
      <div className="space-y-2">
        {visible.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            seen={seenIds.has(task.id)}
            onRegisterAction={onRegisterAction}
            onMarkSeen={onMarkSeen}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--copilot-accent)] hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Ver menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Ver {hiddenCount} más
            </>
          )}
        </button>
      )}
    </section>
  );
}

export type DailyOperationsQueuePanelProps = {
  queue: DailyOperationsQueue | null;
  loading?: boolean;
  error?: string | null;
  stale?: boolean;
  cached?: boolean;
  generatedAt?: string | null;
  expiresAt?: string | null;
  refreshing?: boolean;
  onRefresh?: (force?: boolean) => void;
  onRegisterAction?: (task: OperationalTask) => void;
};

export function DailyOperationsQueuePanel({
  queue,
  loading = false,
  error = null,
  stale = false,
  cached = false,
  generatedAt = null,
  expiresAt = null,
  refreshing = false,
  onRefresh,
  onRegisterAction,
}: DailyOperationsQueuePanelProps) {
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeenIds());

  const markSeen = useCallback((taskId: string) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      saveSeenIds(next);
      return next;
    });
  }, []);

  const sections = useMemo(() => {
    if (!queue) return [];
    return allSectionsWithTasks(queue);
  }, [queue]);

  const showStaleBanner = stale || (expiresAt != null && isCacheStale(expiresAt));

  if (loading && !queue) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-6">
        <div className="flex items-center gap-3 text-[var(--copilot-text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-sm">Preparando cola operativa…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-gradient-to-b from-[var(--copilot-surface)] to-[var(--copilot-surface-alt)]/30 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[var(--copilot-border)] flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="rounded-lg bg-[var(--copilot-accent)]/10 p-2 shrink-0">
            <Sparkles className="h-4 w-4 text-[var(--copilot-accent)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--copilot-text)]">Cola operativa del día</h2>
            <p className="text-[11px] text-[var(--copilot-text-muted)] mt-0.5">
              {generatedAt ? `Actualizada ${formatRelativeTime(generatedAt)}` : "Sin datos"}
              {cached && <span className="ml-1 opacity-70">· caché</span>}
              {queue && (
                <span className="ml-1">
                  · {queue.stats.total_tasks} tareas · {queue.stats.urgent_count} urgentes
                </span>
              )}
            </p>
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={() => onRefresh(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2 py-1 text-[11px] font-medium text-[var(--copilot-text-muted)] hover:bg-[var(--copilot-surface)] disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Recalcular
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {showStaleBanner && !error && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            La cola puede estar desactualizada. Recalcula para ver cambios recientes.
          </p>
        )}

        {!loading && queue && isQueueEmpty(queue) && (
          <div className="text-center py-6">
            <p className="text-sm font-medium text-[var(--copilot-text)]">Cola vacía</p>
            <p className="text-xs text-[var(--copilot-text-muted)] mt-1">
              No hay tareas operativas pendientes para hoy.
            </p>
          </div>
        )}

        {queue &&
          sections.map((section) => (
            <QueueSectionBlock
              key={section}
              section={section}
              tasks={getSectionTasks(queue, section)}
              seenIds={seenIds}
              onRegisterAction={onRegisterAction}
              onMarkSeen={markSeen}
            />
          ))}
      </div>
    </div>
  );
}
