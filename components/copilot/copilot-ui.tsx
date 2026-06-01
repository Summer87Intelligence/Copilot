import type { ReactNode } from "react";
import Link from "next/link";

const primaryBtnClass =
  "inline-flex items-center justify-center rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]";

export const copilotPageMainClass =
  "flex-1 space-y-6 overflow-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8";

const ink = "text-[var(--copilot-ink)]";
const muted = "text-[var(--copilot-ink-muted)]";

export function CopilotCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CopilotSectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className={`text-sm font-semibold tracking-tight ${ink}`}>
          {title}
        </h2>
        {subtitle ? (
          <p className={`mt-0.5 text-xs ${muted}`}>{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CopilotBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const tones: Record<typeof tone, string> = {
    neutral: "bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink)]",
    warning: "bg-amber-100/80 text-amber-900",
    danger: "bg-rose-100/80 text-rose-900",
    success: "bg-emerald-100/70 text-emerald-900",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function CopilotPrimaryLink({
  href,
  children,
  className = "",
  ...rest
}: React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={`${primaryBtnClass} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

export function CopilotPrimaryButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${primaryBtnClass} ${className}`} {...rest}>
      {children}
    </button>
  );
}

const ghostBtnClass =
  "inline-flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-white/60 px-3.5 py-2 text-sm font-medium text-[var(--copilot-ink)] shadow-sm transition hover:bg-white";

export function CopilotGhostLink({
  href,
  children,
  className = "",
  ...rest
}: React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={`${ghostBtnClass} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

export function CopilotGhostButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${ghostBtnClass} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function CopilotKpiCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: string;
}) {
  return (
    <CopilotCard className="flex flex-col gap-1.5">
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
        {label}
      </p>
      <p className={`text-xl font-semibold tracking-tight ${ink}`}>{value}</p>
      {hint ? <p className={`text-xs ${muted}`}>{hint}</p> : null}
      {trend ? (
        <p className="text-xs font-medium text-[rgba(44,40,37,0.5)]"> {trend}</p>
      ) : null}
    </CopilotCard>
  );
}
