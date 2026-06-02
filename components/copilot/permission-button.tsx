"use client";

import { Lock } from "lucide-react";

import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

type PermissionButtonProps = {
  onClick?: () => void;
  children: React.ReactNode;
  lockedLabel?: string;
  className?: string;
  lockedClassName?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
};

/**
 * Renders a normal button for superadmin; a disabled locked button for read-only roles.
 * Never calls onClick when locked.
 */
export function PermissionButton({
  onClick,
  children,
  lockedLabel = "Solo disponible para superadmin.",
  className,
  lockedClassName,
  disabled = false,
  type = "button",
}: PermissionButtonProps) {
  const { canWrite } = useCopilotPermissions();

  if (!canWrite) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={lockedLabel}
        className={
          lockedClassName ??
          "inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white/50 px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] opacity-60"
        }
      >
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
        {children}
      </button>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}
