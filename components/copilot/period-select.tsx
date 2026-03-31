"use client";

export function PeriodSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--copilot-ink)]">
      <span className="text-[var(--copilot-ink-muted)]">Período</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none ring-0 focus:border-[rgba(31,107,74,0.35)]"
      >
        <option value="mar-2026">Marzo 2026</option>
        <option value="feb-2026">Febrero 2026</option>
        <option value="q1-2026">Q1 2026</option>
        <option value="ytd-2026">2026 (YTD)</option>
      </select>
    </label>
  );
}
