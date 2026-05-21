"use client";

/** Label corto con explicación opcional en tooltip nativo (sin ruido en card). */
export function HoyMetricLabel({
  label,
  tip,
  className = "text-[var(--copilot-ink-muted)]",
}: {
  label: string;
  tip?: string;
  className?: string;
}) {
  if (!tip) {
    return <span className={className}>{label}</span>;
  }
  return (
    <span className={`${className} cursor-help border-b border-dotted border-[var(--copilot-border)]`} title={tip}>
      {label}
    </span>
  );
}
