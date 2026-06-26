"use client";

import {
  HELPDESK_STATUS_LABELS,
  HELPDESK_PRIORITY_LABELS,
  type HelpdeskStatus,
  type HelpdeskPriority,
} from "@/lib/helpdesk-types";

const STATUS_STYLES: Record<HelpdeskStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  reviewing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  in_progress: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const PRIORITY_STYLES: Record<HelpdeskPriority, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function HelpdeskStatusBadge({ status }: { status: HelpdeskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {HELPDESK_STATUS_LABELS[status]}
    </span>
  );
}

export function HelpdeskPriorityBadge({ priority }: { priority: HelpdeskPriority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLES[priority]}`}
    >
      {HELPDESK_PRIORITY_LABELS[priority]}
    </span>
  );
}
