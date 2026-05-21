"use client";

export function HoyScopeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
      {label}
    </span>
  );
}
