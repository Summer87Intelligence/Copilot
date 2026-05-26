"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { normalizeAgentHref } from "@/lib/copilot-agents/normalize-agent-href";

type AgentStatus = "active" | "coming_soon";

const STATUS_STYLES: Record<AgentStatus, { label: string; cls: string }> = {
  active: {
    label: "Activo",
    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  coming_soon: {
    label: "Próximamente",
    cls: "bg-slate-100 text-slate-500 border border-slate-200",
  },
};

export function AgentCard({
  icon: Icon,
  name,
  description,
  status,
  showStatusBadge = true,
  ctaLabel,
  ctaHref,
  onCta,
  children,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  status: AgentStatus;
  showStatusBadge?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
  onCta?: () => void;
  children?: React.ReactNode;
}) {
  const badge = STATUS_STYLES[status];
  const isActive = status === "active";

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white ${
        isActive
          ? "border-[var(--copilot-border)] shadow-sm"
          : "border-[var(--copilot-border)]/60 opacity-75"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent)]/10">
          <Icon className="h-5 w-5 text-[var(--copilot-accent)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--copilot-ink)]">
              {name}
            </p>
            {showStatusBadge ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none ${badge.cls}`}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
            {description}
          </p>
        </div>
      </div>

      {/* Children (result area) */}
      {children ? (
        <div className="border-t border-[var(--copilot-border)]/60 px-5 py-4">
          {children}
        </div>
      ) : null}

      {/* CTA */}
      {isActive && ctaLabel && (onCta || ctaHref) ? (
        <div
          className={`${children ? "" : "border-t border-[var(--copilot-border)]/60"} px-5 py-3`}
        >
          {ctaHref ? (
            <Link
              href={normalizeAgentHref(ctaHref)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
            >
              {ctaLabel}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onCta}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
            >
              {ctaLabel}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
