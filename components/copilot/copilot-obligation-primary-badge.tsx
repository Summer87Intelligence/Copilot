import type { PrimaryObligationState } from "@/lib/copilot-obligation-primary-state";
import { PRIMARY_OBLIGATION_LABEL } from "@/lib/copilot-obligation-primary-state";

const BADGE_CLASS: Record<PrimaryObligationState, string> = {
  overdue: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] ring-rose-200/80",
  critical: "bg-orange-100 text-orange-950 ring-orange-200/80",
  due_soon: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] ring-amber-200/80",
  scheduled: "bg-[rgba(44,40,37,0.08)] text-[var(--copilot-ink)] ring-[var(--copilot-border)]",
  covered: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] ring-emerald-200/80",
  normal: "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink)] ring-slate-200/80",
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
