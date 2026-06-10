import type { ReactNode } from "react";
import Link from "next/link";

import {
  CopilotButton,
  CopilotButtonLink,
  copilotButtonClassName,
  type CopilotButtonSize,
  type CopilotButtonVariant,
} from "@/components/copilot/ui/copilot-button";

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
  size,
  ...rest
}: React.ComponentProps<typeof Link> & { size?: CopilotButtonSize }) {
  return (
    <CopilotButtonLink href={href} variant="primary" size={size} className={className} {...rest}>
      {children}
    </CopilotButtonLink>
  );
}

export function CopilotPrimaryButton({
  children,
  className = "",
  size,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: CopilotButtonSize }) {
  return (
    <CopilotButton variant="primary" size={size} className={className} {...rest}>
      {children}
    </CopilotButton>
  );
}

export function CopilotGhostLink({
  href,
  children,
  className = "",
  size,
  ...rest
}: React.ComponentProps<typeof Link> & { size?: CopilotButtonSize }) {
  return (
    <CopilotButtonLink href={href} variant="ghost" size={size} className={className} {...rest}>
      {children}
    </CopilotButtonLink>
  );
}

export function CopilotGhostButton({
  children,
  className = "",
  size,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: CopilotButtonSize }) {
  return (
    <CopilotButton variant="ghost" size={size} className={className} {...rest}>
      {children}
    </CopilotButton>
  );
}

export {
  CopilotButton,
  CopilotButtonLink,
  copilotButtonClassName,
  type CopilotButtonVariant,
  type CopilotButtonSize,
};

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
