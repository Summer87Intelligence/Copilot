export function CopilotSkeletonLine({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`h-3 animate-pulse rounded-md bg-[rgba(44,40,37,0.08)] ${className}`}
      aria-hidden
    />
  );
}

export function CopilotSkeletonCard({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--copilot-border)] bg-white/70 p-4 ${className}`}
      aria-hidden
    >
      <CopilotSkeletonLine className="h-2.5 w-24" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <CopilotSkeletonLine key={index} className={index === lines - 1 ? "w-2/3" : "w-full"} />
        ))}
      </div>
    </div>
  );
}

export function CopilotSkeletonKpiRow({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-[var(--copilot-border)] bg-white/70 p-3"
        >
          <CopilotSkeletonLine className="h-2 w-16" />
          <CopilotSkeletonLine className="mt-2 h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

export function CopilotSkeletonTable({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-white/70"
      aria-hidden
    >
      <div className="border-b border-[var(--copilot-border)] px-3 py-2">
        <div className="flex gap-3">
          {Array.from({ length: columns }).map((_, index) => (
            <CopilotSkeletonLine key={index} className="h-2.5 w-20" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-[var(--copilot-border)]">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-3 px-3 py-2.5">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <CopilotSkeletonLine key={colIndex} className="h-3 w-full max-w-[8rem]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
