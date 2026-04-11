import { CopilotCard, CopilotPrimaryButton, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";

export function DecisionRouteCard({
  title,
  description,
  ctaLabel,
  href,
  onCtaClick,
  badge,
  disabled = false,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  href?: string;
  onCtaClick?: () => void;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <CopilotCard className="flex h-full flex-col border-[rgba(31,107,74,0.12)] bg-[var(--copilot-card)] p-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-[var(--copilot-ink)]">
            {title}
          </h3>
          {badge ? (
            <span className="shrink-0 rounded-lg bg-[rgba(44,40,37,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--copilot-ink)]">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-snug text-[var(--copilot-ink-muted)]">
          {description}
        </p>
      </div>
      <div className="mt-6">
        {href && !disabled ? (
          <CopilotPrimaryLink href={href} className="w-full justify-center py-3 sm:w-auto sm:min-w-[200px]">
            {ctaLabel}
          </CopilotPrimaryLink>
        ) : (
          <CopilotPrimaryButton
            type="button"
            className="w-full sm:w-auto sm:min-w-[200px]"
            disabled={disabled}
            onClick={onCtaClick}
          >
            {ctaLabel}
          </CopilotPrimaryButton>
        )}
      </div>
    </CopilotCard>
  );
}
