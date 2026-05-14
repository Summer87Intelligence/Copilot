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
import { buildGroupedOperationalFeed } from "@/lib/copilot-operational-feed-groups";
import type {
  OperationalFeedGroup,
  OperationalFeedItem,
  OperationalFeedTimelineItem,
} from "@/lib/copilot-operational-feed-types";

type RutasOperationalFeedSnapshot = {
  items: OperationalFeedItem[];
  groups: OperationalFeedGroup[];
  priorities: OperationalFeedGroup[];
  timeline: OperationalFeedTimelineItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const RutasOperationalFeedContext = createContext<RutasOperationalFeedSnapshot | null>(null);

let sharedFeedRequest: Promise<{
  items: OperationalFeedItem[];
  groups: OperationalFeedGroup[];
  priorities: OperationalFeedGroup[];
  timeline: OperationalFeedTimelineItem[];
}> | null = null;

async function loadRutasOperationalFeedSnapshot() {
  if (!sharedFeedRequest) {
    sharedFeedRequest = (async () => {
      const [feedRes, timelineRes] = await Promise.all([
        copilotApiFetch("/api/copilot/operational-feed"),
        copilotApiFetch("/api/copilot/operational-feed/timeline?limit=5"),
      ]);
      const feedJson = (await feedRes.json()) as {
        items?: OperationalFeedItem[];
        groups?: OperationalFeedGroup[];
        priorities?: OperationalFeedGroup[];
        error?: string;
      };
      const timelineJson = (await timelineRes.json()) as {
        events?: OperationalFeedTimelineItem[];
      };
      if (!feedRes.ok) {
        throw new Error(feedJson.error ?? "No se pudo cargar el centro operativo.");
      }
      const items = feedJson.items ?? [];
      const grouped =
        feedJson.groups && feedJson.priorities
          ? { groups: feedJson.groups, priorities: feedJson.priorities }
          : buildGroupedOperationalFeed(items);
      return {
        items,
        groups: grouped.groups,
        priorities: grouped.priorities,
        timeline: timelineJson.events ?? [],
      };
    })().finally(() => {
      sharedFeedRequest = null;
    });
  }
  return sharedFeedRequest;
}

export function RutasOperationalFeedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<OperationalFeedItem[]>([]);
  const [groups, setGroups] = useState<OperationalFeedGroup[]>([]);
  const [priorities, setPriorities] = useState<OperationalFeedGroup[]>([]);
  const [timeline, setTimeline] = useState<OperationalFeedTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await loadRutasOperationalFeedSnapshot();
      setItems(snapshot.items);
      setGroups(snapshot.groups);
      setPriorities(snapshot.priorities);
      setTimeline(snapshot.timeline);
    } catch (loadError) {
      setItems([]);
      setGroups([]);
      setPriorities([]);
      setTimeline([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Error de red al cargar el centro operativo."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      items,
      groups,
      priorities,
      timeline,
      loading,
      error,
      refresh,
    }),
    [error, groups, items, loading, priorities, refresh, timeline]
  );

  return (
    <RutasOperationalFeedContext.Provider value={value}>
      {children}
    </RutasOperationalFeedContext.Provider>
  );
}

export function useRutasOperationalFeedSnapshot(): RutasOperationalFeedSnapshot {
  const context = useContext(RutasOperationalFeedContext);
  if (!context) {
    throw new Error("useRutasOperationalFeedSnapshot requiere RutasOperationalFeedProvider.");
  }
  return context;
}
