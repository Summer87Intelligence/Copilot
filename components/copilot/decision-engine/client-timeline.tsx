"use client";

import type { DECollectionAction } from "@/lib/decision-engine/de-types";
import { COLLECTION_ACTION_TYPE_LABELS, COLLECTION_STATUS_LABELS } from "@/lib/copilot-collection-types";

type Props = {
  actions: DECollectionAction[];
  limit?: number;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

const STATUS_DOT: Record<string, string> = {
  paid:             "bg-emerald-500",
  promised_payment: "bg-blue-500",
  escalated:        "bg-rose-500",
  disputed:         "bg-orange-500",
  contacted:        "bg-blue-400",
  pending_review:   "bg-slate-400",
  paused:           "bg-slate-300",
};

export function ClientTimeline({ actions, limit = 4 }: Props) {
  if (actions.length === 0) {
    return (
      <p className="text-xs text-[var(--copilot-text-muted)] italic">Sin acciones registradas.</p>
    );
  }

  const visible = actions.slice(0, limit);

  return (
    <div className="space-y-2">
      {visible.map((action) => {
        const dot = STATUS_DOT[action.status] ?? "bg-slate-400";
        const typeLabel =
          COLLECTION_ACTION_TYPE_LABELS[action.action_type as keyof typeof COLLECTION_ACTION_TYPE_LABELS]
          ?? action.action_type;
        const statusLabel =
          COLLECTION_STATUS_LABELS[action.status as keyof typeof COLLECTION_STATUS_LABELS]
          ?? action.status;

        return (
          <div key={action.id} className="flex gap-2.5 items-start">
            <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-[var(--copilot-text)]">{typeLabel}</span>
                <span className="text-xs text-[var(--copilot-text-muted)]">·</span>
                <span className="text-xs text-[var(--copilot-text-secondary)]">{statusLabel}</span>
                <span className="text-xs text-[var(--copilot-text-muted)] ml-auto tabular-nums">
                  {formatDate(action.created_at)}
                </span>
              </div>
              {action.notes && (
                <p className="text-xs text-[var(--copilot-text-muted)] mt-0.5 line-clamp-2">{action.notes}</p>
              )}
              {action.promise_date && (
                <p className="text-xs text-blue-600 mt-0.5">
                  Promesa: {formatDate(action.promise_date)}
                  {action.promise_amount != null && (
                    <> · {action.promise_currency ?? ""} {action.promise_amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}</>
                  )}
                </p>
              )}
            </div>
          </div>
        );
      })}
      {actions.length > limit && (
        <p className="text-xs text-[var(--copilot-text-muted)] pl-4.5">
          +{actions.length - limit} acciones anteriores
        </p>
      )}
    </div>
  );
}
