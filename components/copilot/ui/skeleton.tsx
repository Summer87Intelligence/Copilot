/**
 * Skeleton (DS-Core) — placeholders de carga con estructura.
 *
 * Reemplaza los bloques grises planos gigantes (Dashboard) y las cajas vacías
 * (Cobranza/Tareas) por placeholders que reflejan la forma del contenido real.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--copilot-soft-bg)] ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** Placeholder con forma de KPI card (label + valor + pie). */
export function SkeletonMetricCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm ${className}`}
      aria-hidden
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/** Grilla de KPI cards en carga. */
export function SkeletonMetricGrid({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${className}`}
      aria-hidden
      aria-busy="true"
    >
      {Array.from({ length: Math.max(1, count) }).map((_, i) => (
        <SkeletonMetricCard key={i} />
      ))}
    </div>
  );
}
