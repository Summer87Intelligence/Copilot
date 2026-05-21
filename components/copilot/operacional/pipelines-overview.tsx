"use client";

import { PipelineHealthPanel } from "@/components/copilot/pipeline-health-panel";
import { usePipelineHealthRealtime } from "@/lib/copilot-pipeline-health-realtime";

export function PipelinesOverview() {
  const {
    summaries,
    loading,
    error,
    realtimeStatus,
    lastUpdatedAt,
    isRefreshing,
  } = usePipelineHealthRealtime();

  return (
    <PipelineHealthPanel
      summaries={summaries}
      loading={loading}
      error={error}
      realtimeStatus={realtimeStatus}
      lastUpdatedAt={lastUpdatedAt}
      isRefreshing={isRefreshing}
    />
  );
}
