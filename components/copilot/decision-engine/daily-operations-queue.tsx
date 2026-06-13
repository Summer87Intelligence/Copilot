"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Clock,
  Phone,
  ShieldAlert,
  UserX,
} from "lucide-react";
import type { FollowUpQueueItem } from "@/lib/decision-engine/de-types";
import {
  RECOMMENDED_ACTION_LABELS,
  RISK_LEVEL_LABELS,
  SLA_STATUS_COLORS,
  SLA_STATUS_LABELS,
} from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

type Section = {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  filter: (item: FollowUpQueueItem) => boolean;
};

const SECTIONS: Section[] = [
  {
    id: "critical",
    label: "SLA crítico / atrasados",
    icon: <ShieldAlert className="h-4 w-4" />,
    color: "text-[var(--copilot-danger-text)]",
    filter: (i) => i.follow_up_result.sla_status === "critical" || i.follow_up_result.sla_status === "overdue",
  },
  {
    id: "promises",
    label: "Promesas incumplidas",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-orange-600",
    filter: (i) => i.follow_up_result.operational_state === "overdue_no_contact" && i.collection_status === "promised_payment",
  },
  {
    id: "escalated",
    label: "Escalaciones activas",
    icon: <ArrowUpRight className="h-4 w-4" />,
    color: "text-[var(--copilot-danger-text-strong)]",
    filter: (i) => i.follow_up_result.operational_state === "escalated_active",
  },
  {
    id: "no_contact",
    label: "Sin contacto",
    icon: <UserX className="h-4 w-4" />,
    color: "text-[var(--copilot-ink-muted)]",
    filter: (i) => i.follow_up_result.sla_status === "no_contact",
  },
  {
    id: "due_today",
    label: "Vencen hoy",
    icon: <Clock className="h-4 w-4" />,
    color: "text-[var(--copilot-warning-text)]",
    filter: (i) => i.follow_up_result.sla_status === "due_today",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_DOT: Record<string, string> = {
  critical: "bg-[var(--copilot-danger-text)]",
  high:     "bg-[var(--copilot-warning-text)]",
  medium:   "bg-[var(--copilot-warning-text)]",
  low:      "bg-[var(--copilot-success-text)]",
};

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Queue item row
// ---------------------------------------------------------------------------

type ItemRowProps = {
  item: FollowUpQueueItem;
  onActionClick?: (item: FollowUpQueueItem) => void;
};

function QueueItemRow({ item, onActionClick }: ItemRowProps) {
  const slaColor = SLA_STATUS_COLORS[item.follow_up_result.sla_status] ?? "";
  const riskDot = RISK_DOT[item.risk_level] ?? "bg-[var(--copilot-border)]";

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--copilot-surface-alt)] transition-colors group">
      {/* Risk dot */}
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${riskDot}`} />

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[var(--copilot-text)] truncate">
            {item.company_name}
          </span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${slaColor}`}>
            {SLA_STATUS_LABELS[item.follow_up_result.sla_status]}
          </span>
          <span className="text-xs text-[var(--copilot-text-muted)] tabular-nums ml-auto">
            {formatCurrency(item.pending_amount, item.currency_code)}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--copilot-text-secondary)]">
          <span>{item.follow_up_result.pending_action}</span>
          <span className="text-[var(--copilot-text-muted)]">·</span>
          <span className="text-[var(--copilot-text-muted)]">
            {RISK_LEVEL_LABELS[item.risk_level]} · {item.oldest_days > 0 ? `${item.oldest_days}d atrasado` : "no atrasado"}
          </span>
          {item.follow_up_result.next_follow_up_at && (
            <>
              <span className="text-[var(--copilot-text-muted)]">·</span>
              <span className="inline-flex items-center gap-1 text-[var(--copilot-text-muted)]">
                <CalendarClock className="h-3 w-3" />
                {formatDate(item.follow_up_result.next_follow_up_at)}
              </span>
            </>
          )}
        </div>

        <p className="text-xs text-[var(--copilot-text-muted)] italic">
          {item.follow_up_result.follow_up_reason}
        </p>
      </div>

      {/* Quick action */}
      {onActionClick && (
        <button
          type="button"
          onClick={() => onActionClick(item)}
          className="shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-[var(--copilot-accent)] hover:bg-[var(--copilot-surface-alt)] transition-all"
        >
          <Phone className="h-3 w-3" />
          {RECOMMENDED_ACTION_LABELS[item.recommendation.action] ?? "Actuar"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  queue: FollowUpQueueItem[];
  onActionClick?: (item: FollowUpQueueItem) => void;
};

export function DailyOperationsQueue({ queue, onActionClick }: Props) {
  if (queue.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-5 py-8 text-center">
        <p className="text-sm font-medium text-[var(--copilot-text)]">Cola operativa vacía</p>
        <p className="text-xs text-[var(--copilot-text-muted)] mt-1">
          Sin seguimientos pendientes. Buena señal.
        </p>
      </div>
    );
  }

  const totalBySection = SECTIONS.map((s) => ({
    ...s,
    items: queue.filter(s.filter),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--copilot-border)] flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
          Cola operativa
          <span className="ml-1.5 text-[var(--copilot-text-secondary)]">({queue.length})</span>
        </h3>
        <span className="text-xs text-[var(--copilot-text-muted)]">ordenado por SLA</span>
      </div>

      {/* Sections */}
      <div className="divide-y divide-[var(--copilot-border)]">
        {totalBySection.map((section) => (
          <div key={section.id}>
            {/* Section header */}
            <div className={`flex items-center gap-1.5 px-4 py-2 bg-[var(--copilot-surface-alt)] ${section.color}`}>
              {section.icon}
              <span className="text-xs font-semibold">{section.label}</span>
              <span className="ml-auto text-xs font-medium opacity-70">
                {section.items.length}
              </span>
            </div>
            {/* Items */}
            <div className="divide-y divide-[var(--copilot-border)]">
              {section.items.map((item) => (
                <QueueItemRow
                  key={`${item.company_id}::${item.currency_code}`}
                  item={item}
                  onActionClick={onActionClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
