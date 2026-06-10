import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { copilotDisabledStateClass } from "@/components/copilot/ui/copilot-visual-system";

export type CopilotButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type CopilotButtonSize = "sm" | "md" | "lg";

const buttonBaseClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]";

export const copilotButtonVariantClass: Record<CopilotButtonVariant, string> = {
  primary:
    "border border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-white shadow-sm hover:border-[#185a3d] hover:bg-[#185a3d]",
  secondary:
    "border border-neutral-200 bg-white text-[var(--copilot-accent)] shadow-sm hover:bg-[var(--copilot-accent-soft)]",
  danger:
    "border border-rose-200 bg-rose-50/90 text-rose-700 shadow-sm hover:bg-rose-100/90",
  ghost:
    "border border-transparent bg-transparent text-[var(--copilot-accent)] hover:bg-[var(--copilot-accent-soft)]",
};

export const copilotButtonSizeClass: Record<CopilotButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function copilotButtonClassName({
  variant = "primary",
  size = "md",
  className = "",
  fullWidth = false,
}: {
  variant?: CopilotButtonVariant;
  size?: CopilotButtonSize;
  className?: string;
  fullWidth?: boolean;
}) {
  return [
    buttonBaseClass,
    copilotButtonVariantClass[variant],
    copilotButtonSizeClass[size],
    copilotDisabledStateClass,
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type CopilotButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: CopilotButtonVariant;
  size?: CopilotButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
};

export function CopilotButton({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: CopilotButtonProps) {
  return (
    <button
      type="button"
      className={copilotButtonClassName({ variant, size, className, fullWidth })}
      {...rest}
    >
      {children}
    </button>
  );
}

type CopilotButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: CopilotButtonVariant;
  size?: CopilotButtonSize;
  fullWidth?: boolean;
};

export function CopilotButtonLink({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: CopilotButtonLinkProps) {
  return (
    <Link
      className={copilotButtonClassName({ variant, size, className, fullWidth })}
      {...rest}
    >
      {children}
    </Link>
  );
}
