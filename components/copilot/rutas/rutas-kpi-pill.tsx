export function RutasKpiPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "warning" | "success";
}) {
  const ring =
    tone === "danger"
      ? "border-rose-200/90 bg-rose-50/80"
      : tone === "warning"
        ? "border-amber-200/90 bg-amber-50/70"
        : tone === "success"
          ? "border-emerald-200/90 bg-emerald-50/70"
          : "border-[var(--copilot-border)] bg-white/80";
  return (
    <div
      className={`flex min-w-[7rem] shrink-0 flex-col rounded-xl border px-2.5 py-1.5 shadow-sm ${ring}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </span>
      <span className="mt-0.5 truncate text-base font-semibold tabular-nums text-[var(--copilot-ink)]">
        {value}
      </span>
    </div>
  );
}
