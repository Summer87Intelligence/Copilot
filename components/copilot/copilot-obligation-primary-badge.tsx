import type { PrimaryObligationState } from "@/lib/copilot-obligation-primary-state";
import { PRIMARY_OBLIGATION_LABEL } from "@/lib/copilot-obligation-primary-state";

const BADGE_CLASS: Record<PrimaryObligationState, string> = {
  overdue: "bg-rose-100 text-rose-950 ring-rose-200/80",
  critical: "bg-orange-100 text-orange-950 ring-orange-200/80",
  due_soon: "bg-amber-100 text-amber-950 ring-amber-200/80",
  scheduled: "bg-[rgba(44,40,37,0.08)] text-[var(--copilot-ink)] ring-[var(--copilot-border)]",
  covered: "bg-emerald-100 text-emerald-950 ring-emerald-200/80",
  normal: "bg-slate-100 text-slate-800 ring-slate-200/80",
};

export function CopilotObligationPrimaryBadge({
  state,
}: {
  state: PrimaryObligationState;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${BADGE_CLASS[state]}`}
    >
      {PRIMARY_OBLIGATION_LABEL[state]}
    </span>
  );
}
