import type { ReactNode } from "react";

export function OicEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--copilot-border)] bg-white/40 px-6 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
        {title}
      </p>
      {description ? (
        <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
