"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  Clock,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Users,
  XCircle,
} from "lucide-react";
import type { DECollectionAction } from "@/lib/decision-engine/de-types";
import { COLLECTION_ACTION_TYPE_LABELS, COLLECTION_STATUS_LABELS } from "@/lib/copilot-collection-types";

// ---------------------------------------------------------------------------
// Action type icons
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<string, React.ReactNode> = {
  call:             <Phone className="h-3.5 w-3.5" />,
  whatsapp:         <MessageCircle className="h-3.5 w-3.5" />,
  email:            <Mail className="h-3.5 w-3.5" />,
  meeting:          <Users className="h-3.5 w-3.5" />,
  internal_note:    <FileText className="h-3.5 w-3.5" />,
  payment_promise:  <CheckCircle className="h-3.5 w-3.5" />,
  dispute:          <XCircle className="h-3.5 w-3.5" />,
  escalation:       <ArrowUpRight className="h-3.5 w-3.5" />,
};

// ---------------------------------------------------------------------------
// Status styles
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { dot: string; pill: string }> = {
  paid:             { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  promised_payment: { dot: "bg-blue-500",    pill: "bg-blue-50 text-blue-700 border border-blue-200" },
  escalated:        { dot: "bg-rose-600",    pill: "bg-rose-100 text-rose-800 border border-rose-300" },
  disputed:         { dot: "bg-orange-500",  pill: "bg-orange-50 text-orange-700 border border-orange-200" },
  contacted:        { dot: "bg-blue-400",    pill: "bg-blue-50 text-blue-600 border border-blue-100" },
  pending_review:   { dot: "bg-slate-400",   pill: "bg-slate-50 text-slate-600 border border-slate-200" },
  paused:           { dot: "bg-slate-300",   pill: "bg-slate-50 text-slate-500 border border-slate-100" },
};

const DEFAULT_CONFIG = { dot: "bg-slate-400", pill: "bg-slate-50 text-slate-600 border border-slate-200" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? "es" : ""}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Escalation / promise indicators
// ---------------------------------------------------------------------------

function PromiseChip({ date, amount, currency, status }: {
  date: string;
  amount: number | null;
  currency: string | null;
  status: string;
}) {
  const fulfilled = status === "paid";
  const broken = new Date(date) < new Date() && status !== "paid";

  if (fulfilled) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
        <CheckCircle className="h-3 w-3" />
        Pagado
      </span>
    );
  }
  if (broken) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
        <XCircle className="h-3 w-3" />
        Promesa vencida · {formatDate(date)}
        {amount != null && <> · {currency ?? ""} {amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}</>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
      <Clock className="h-3 w-3" />
      Promesa para {formatDate(date)}
      {amount != null && <> · {currency ?? ""} {amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}</>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single timeline entry
// ---------------------------------------------------------------------------

function TimelineEntry({ action }: { action: DECollectionAction }) {
  const cfg = STATUS_CONFIG[action.status] ?? DEFAULT_CONFIG;
  const typeLabel = COLLECTION_ACTION_TYPE_LABELS[action.action_type as keyof typeof COLLECTION_ACTION_TYPE_LABELS] ?? action.action_type;
  const statusLabel = COLLECTION_STATUS_LABELS[action.status as keyof typeof COLLECTION_STATUS_LABELS] ?? action.status;
  const icon = ACTION_ICONS[action.action_type] ?? <FileText className="h-3.5 w-3.5" />;
  const isEscalation = action.status === "escalated";

  return (
    <div className={`flex gap-2.5 items-start ${isEscalation ? "pl-0" : ""}`}>
      {/* Icon + connector */}
      <div className="flex flex-col items-center shrink-0 mt-0.5">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${
          isEscalation
            ? "bg-rose-100 border-rose-300 text-rose-700"
            : "bg-[var(--copilot-surface)] border-[var(--copilot-border)] text-[var(--copilot-text-secondary)]"
        }`}>
          {icon}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-[var(--copilot-text)]">{typeLabel}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.pill}`}>
              {statusLabel}
            </span>
          </div>
          <span className="text-[10px] text-[var(--copilot-text-muted)] tabular-nums whitespace-nowrap">
            {relativeTime(action.created_at)}
          </span>
        </div>

        {action.notes && (
          <p className="text-xs text-[var(--copilot-text-muted)] mt-0.5 line-clamp-2 leading-relaxed">
            {action.notes}
          </p>
        )}

        {action.promise_date && (
          <div className="mt-1">
            <PromiseChip
              date={action.promise_date}
              amount={action.promise_amount}
              currency={action.promise_currency}
              status={action.status}
            />
          </div>
        )}

        {isEscalation && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-600">
            <AlertTriangle className="h-3 w-3" />
            <span>Caso escalado — requiere gestión prioritaria</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  actions: DECollectionAction[];
  limit?: number;
};

export function ClientTimeline({ actions, limit = 5 }: Props) {
  if (actions.length === 0) {
    return (
      <p className="text-xs text-[var(--copilot-text-muted)] italic py-1">
        Sin acciones registradas aún.
      </p>
    );
  }

  const visible = actions.slice(0, limit);

  return (
    <div className="space-y-0">
      {visible.map((action, idx) => (
        <div
          key={action.id}
          className={idx < visible.length - 1 ? "border-l-2 border-[var(--copilot-border)] ml-2.5 pl-4 relative" : "pl-4 ml-2.5 relative"}
        >
          <div className="absolute left-[-0.35rem] top-0.5 h-2 w-2 rounded-full bg-[var(--copilot-border)]" />
          <TimelineEntry action={action} />
        </div>
      ))}
      {actions.length > limit && (
        <p className="text-[10px] text-[var(--copilot-text-muted)] pl-6 pb-1">
          +{actions.length - limit} acciones anteriores
        </p>
      )}
    </div>
  );
}
