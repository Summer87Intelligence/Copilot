import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import type { PipelineHealthSummary } from "@/lib/data/zeta-pipeline-health";

export type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "degraded"
  | "disconnected";

export type PipelineAlert = {
  pipeline_name: string;
  kind: "stale" | "consecutive_failures" | "rows_failed" | "error";
  message: string;
};

/**
 * Returns the polling interval in ms based on Realtime connection status.
 * When Realtime is healthy, poll less frequently (safety net).
 * When Realtime is degraded/disconnected, poll more aggressively.
 */
export function getPollingIntervalMs(status: RealtimeConnectionStatus): number {
  return status === "connected" ? 60_000 : 15_000;
}

/**
 * Derives operational alerts from pipeline summaries.
 * Pure function — testable without React.
 */
export function derivePipelineAlerts(
  summaries: PipelineHealthSummary[]
): PipelineAlert[] {
  const alerts: PipelineAlert[] = [];

  for (const s of summaries) {
    if (s.is_overdue && s.last_run_at !== null) {
      alerts.push({
        pipeline_name: s.pipeline_name,
        kind: "stale",
        message: "Fuera de ventana esperada",
      });
    }
    if (s.consecutive_failures > 0) {
      const n = s.consecutive_failures;
      alerts.push({
        pipeline_name: s.pipeline_name,
        kind: "consecutive_failures",
        message: `${n} fallo${n !== 1 ? "s" : ""} consecutivo${n !== 1 ? "s" : ""}`,
      });
    }
    if ((s.last_run_rows_failed ?? 0) > 0) {
      const n = s.last_run_rows_failed!;
      alerts.push({
        pipeline_name: s.pipeline_name,
        kind: "rows_failed",
        message: `${n} fila${n !== 1 ? "s" : ""} con error en último run`,
      });
    }
    if (s.last_error_summary) {
      alerts.push({
        pipeline_name: s.pipeline_name,
        kind: "error",
        message: s.last_error_summary,
      });
    }
  }

  return alerts;
}

export type UsePipelineHealthRealtimeResult = {
  summaries: PipelineHealthSummary[];
  loading: boolean;
  error: string | null;
  realtimeStatus: RealtimeConnectionStatus;
  lastUpdatedAt: Date | null;
  isRefreshing: boolean;
  refresh: () => void;
};

async function fetchPipelineHealthFromApi(): Promise<PipelineHealthSummary[]> {
  const res = await fetch("/api/copilot/pipeline-health");
  const json = (await res.json()) as {
    ok: boolean;
    data?: PipelineHealthSummary[];
    error?: string;
  };
  if (!json.ok || !json.data) {
    throw new Error(json.error ?? "No se pudo cargar el estado de pipelines.");
  }
  return json.data;
}

/**
 * Hook that manages Pipeline Health state with Realtime updates + fallback polling.
 *
 * Security model:
 * - Never reads zeta_pipeline_runs directly from the browser.
 * - Realtime subscription is used only as a trigger signal.
 * - All data comes from /api/copilot/pipeline-health which enforces tenant auth.
 */
export function usePipelineHealthRealtime(): UsePipelineHealthRealtimeResult {
  const [summaries, setSummaries] = useState<PipelineHealthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const realtimeStatusRef = useRef<RealtimeConnectionStatus>("connecting");
  realtimeStatusRef.current = realtimeStatus;

  const doFetch = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const data = await fetchPipelineHealthFromApi();
      setSummaries(data);
      setError(null);
      setLastUpdatedAt(new Date());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al cargar pipelines."
      );
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => void doFetch(true), [doFetch]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    void doFetch().finally(() => setLoading(false));
  }, [doFetch]);

  // Realtime subscription — trigger-only pattern.
  // On any INSERT/UPDATE in zeta_pipeline_runs, refetch the secure API.
  // The Realtime event payload is intentionally ignored.
  useEffect(() => {
    const channel = supabase
      .channel("pipeline-runs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zeta_pipeline_runs" },
        () => void doFetch()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("degraded");
        } else if (status === "CLOSED") {
          setRealtimeStatus("disconnected");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [doFetch]);

  // Fallback polling. Interval adapts to Realtime connection health.
  useEffect(() => {
    const intervalMs = getPollingIntervalMs(realtimeStatus);
    const id = setInterval(() => void doFetch(), intervalMs);
    return () => clearInterval(id);
  }, [realtimeStatus, doFetch]);

  return {
    summaries,
    loading,
    error,
    realtimeStatus,
    lastUpdatedAt,
    isRefreshing,
    refresh,
  };
}
