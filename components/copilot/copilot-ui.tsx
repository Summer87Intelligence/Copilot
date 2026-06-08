import type { ReactNode } from "react";
import Link from "next/link";

import {
  copilotDisabledStateClass,
  copilotGhostButtonClass,
} from "@/components/copilot/ui/copilot-visual-system";

const primaryBtnClass =
  `inline-flex items-center justify-center rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)] ${copilotDisabledStateClass}`;

export const copilotPageMainClass =
  "flex-1 space-y-6 overflow-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8";

const ink = "text-[var(--copilot-text)]";
const muted = "text-[var(--copilot-muted)]";

export function CopilotCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-[var(--copilot-shadow)] ${className}`}
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
    neutral:
      "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-text)]",
    warning:
      "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-badge-warning-text)]",
    danger:
      "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-badge-danger-text)]",
    success:
      "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-badge-success-text)]",
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

export function CopilotGhostLink({
  href,
  children,
  className = "",
  ...rest
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={`${copilotGhostButtonClass} ${copilotDisabledStateClass} ${className}`}
      {...rest}
    >
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
    <button
      type="button"
      className={`${copilotGhostButtonClass} ${copilotDisabledStateClass} ${className}`}
      {...rest}
    >
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
        <p className="text-xs font-medium text-[var(--copilot-subtle)]"> {trend}</p>
      ) : null}
    </CopilotCard>
  );
}
