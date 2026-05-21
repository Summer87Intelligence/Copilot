import { CopilotCard } from "@/components/copilot/copilot-ui";

function Bone({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(44,40,37,0.07)] ${className}`} />
  );
}

export function OicSkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <CopilotCard className="space-y-3">
      <Bone className="h-3 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Bone key={i} className="h-4 w-full" />
      ))}
    </CopilotCard>
  );
}

export function OicSkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Bone className="h-3 w-24" />
      <Bone className="h-3 flex-1" />
      <Bone className="h-5 w-16 rounded-md" />
    </div>
  );
}
