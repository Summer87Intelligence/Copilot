"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import type { CopilotRutasSnapshotApiResponse } from "@/lib/copilot-rutas-snapshot-types";
import type { StrategicRecommendation } from "@/lib/copilot-strategic-recommendations-types";

type RutasOperationalTimelineItem = {
  id: string;
  actionId: string;
  eventType: string;
  actorLabel: string | null;
  actionTitle: string | null;
  relatedEntityId: string | null;
  createdAt: string;
};

type RutasOperationalSnapshotContextValue = {
  generatedAt: string | null;
  items: OperationalFeedItem[];
  groups: OperationalFeedGroup[];
  priorities: OperationalFeedGroup[];
  timeline: RutasOperationalTimelineItem[];
  memorySignals: OperationalMemorySignal[];
  narratives: OperationalNarrative[];
  recommendations: StrategicRecommendation[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const RutasOperationalSnapshotContext = createContext<RutasOperationalSnapshotContextValue | null>(
  null
);

function emptySnapshotState(): Omit<RutasOperationalSnapshotContextValue, "loading" | "error" | "refresh"> {
  return {
    generatedAt: null,
    items: [],
    groups: [],
    priorities: [],
    timeline: [],
    memorySignals: [],
    narratives: [],
    recommendations: [],
  };
}

async function loadRutasSnapshot(): Promise<CopilotRutasSnapshotApiResponse> {
  const res = await copilotApiFetch("/api/copilot/rutas-snapshot");
  return (await res.json()) as CopilotRutasSnapshotApiResponse;
}

export function RutasOperationalFeedProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(emptySnapshotState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await loadRutasSnapshot();
      if (!payload.ok) {
        setSnapshot(emptySnapshotState());
        setError(payload.message);
        return;
      }
      setSnapshot({
        generatedAt: payload.data.generatedAt,
        items: payload.data.feed.items,
        groups: payload.data.feed.groups,
        priorities: payload.data.feed.priorities,
        timeline: payload.data.timeline,
        memorySignals: payload.data.memory,
        narratives: payload.data.narratives,
        recommendations: payload.data.recommendations,
      });
    } catch {
      setSnapshot(emptySnapshotState());
      setError("Error de red al cargar el snapshot operacional.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...snapshot,
      loading,
      error,
      refresh,
    }),
    [error, loading, refresh, snapshot]
  );

  return (
    <RutasOperationalSnapshotContext.Provider value={value}>
      {children}
    </RutasOperationalSnapshotContext.Provider>
  );
}

export function useRutasOperationalFeedSnapshot(): RutasOperationalSnapshotContextValue {
  const context = useContext(RutasOperationalSnapshotContext);
  if (!context) {
    throw new Error("useRutasOperationalFeedSnapshot requiere RutasOperationalFeedProvider.");
  }
  return context;
}
