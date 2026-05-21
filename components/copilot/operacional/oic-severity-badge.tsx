import type { OicSeverity } from "@/lib/operacional/types";

const cfg: Record<OicSeverity, { label: string; cls: string }> = {
  ok:       { label: "OK",        cls: "bg-emerald-100/70 text-emerald-900" },
  warning:  { label: "Aviso",     cls: "bg-amber-100/80 text-amber-900" },
  degraded: { label: "Degradado", cls: "bg-orange-100/80 text-orange-900" },
  critical: { label: "Crítico",   cls: "bg-rose-100/80 text-rose-900" },
};

export function OicSeverityBadge({ severity, className = "" }: { severity: OicSeverity; className?: string }) {
  const { label, cls } = cfg[severity];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${cls} ${className}`}>
      {label}
    </span>
  );
}
