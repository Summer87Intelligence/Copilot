"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import type {
  CopilotRutasSnapshotApiResponse,
  SnapshotHealth,
} from "@/lib/copilot-rutas-snapshot-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";
import type { StrategicRecommendation } from "@/lib/copilot-strategic-recommendations-types";

type RutasOperationalTimelineItem = {
  id: string;
  actionId: string;
  eventType: string;
  actorLabel: string | null;
  actionTitle: string | null;
  relatedEntityId: string | null;
  createdAt: string;
  detailSummary?: string | null;
};

type RutasSnapshotRefreshOptions = {
  fresh?: boolean;
  silent?: boolean;
};

export type RutasOptimisticActionPatch = {
  actionId: string;
  assignedTo?: string | null;
  ownerLabel?: string | null;
  operationalStatus?: OperationalFeedItem["status"];
  blocked?: boolean;
};

type RutasActionFeedback = {
  tone: "success" | "error";
  message: string;
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
  workflows: OperationalWorkflowExecution[];
  operationalEvents: OperationalTimelineItem[];
  health: SnapshotHealth | null;
  loading: boolean;
  error: string | null;
  actionFeedback: RutasActionFeedback | null;
  refresh: (options?: RutasSnapshotRefreshOptions) => Promise<void>;
  applyOptimisticActionPatch: (patch: RutasOptimisticActionPatch) => void;
  restoreOptimisticSnapshot: () => void;
  setActionFeedback: (feedback: RutasActionFeedback | null) => void;
};

const RutasOperationalSnapshotContext = createContext<RutasOperationalSnapshotContextValue | null>(
  null
);

function emptySnapshotState(): Omit<
  RutasOperationalSnapshotContextValue,
  "loading" | "error" | "refresh" | "actionFeedback" | "applyOptimisticActionPatch" | "restoreOptimisticSnapshot" | "setActionFeedback"
> {
  return {
    generatedAt: null,
    items: [],
    groups: [],
    priorities: [],
    timeline: [],
    memorySignals: [],
    narratives: [],
    recommendations: [],
    workflows: [],
    operationalEvents: [],
    health: null,
  };
}

function actionIdFromItem(item: OperationalFeedItem): string | null {
  const metadata = item.metadata ?? {};
  if (typeof metadata.actionId === "string") return metadata.actionId;
  if (item.id.startsWith("action:")) return item.id.slice("action:".length);
  return null;
}

function patchFeedItem(
  item: OperationalFeedItem,
  patch: RutasOptimisticActionPatch
): OperationalFeedItem {
  const actionId = actionIdFromItem(item);
  if (!actionId || actionId !== patch.actionId) return item;

  const next: OperationalFeedItem = { ...item };
  if (patch.operationalStatus) {
    next.status = patch.operationalStatus;
  }
  if (patch.blocked != null) {
    next.blocked = patch.blocked;
  }
  if (patch.assignedTo !== undefined) {
    next.owner = patch.ownerLabel
      ? { ...(next.owner ?? {}), label: patch.ownerLabel }
      : next.owner;
  }
  return next;
}

function patchFeedGroup(
  group: OperationalFeedGroup,
  patch: RutasOptimisticActionPatch
): OperationalFeedGroup {
  const primary = patchFeedItem(group.primaryItem, patch);
  const items = group.items.map((item) => patchFeedItem(item, patch));
  if (primary === group.primaryItem && items === group.items) return group;
  return {
    ...group,
    primaryItem: primary,
    items,
  };
}

async function loadRutasSnapshot(fresh = false): Promise<CopilotRutasSnapshotApiResponse> {
  const query = fresh ? "?fresh=1" : "";
  const res = await copilotApiFetch(`/api/copilot/rutas-snapshot${query}`);
  return (await res.json()) as CopilotRutasSnapshotApiResponse;
}

async function loadOperationalWorkflows() {
  const res = await copilotApiFetch("/api/copilot/operational-workflows");
  return (await res.json()) as {
    ok?: boolean;
    workflows?: OperationalWorkflowExecution[];
  };
}

async function loadOperationalEvents() {
  const res = await copilotApiFetch("/api/copilot/operational-events?limit=10");
  return (await res.json()) as {
    ok?: boolean;
    events?: OperationalTimelineItem[];
  };
}

export function RutasOperationalFeedProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(emptySnapshotState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<RutasActionFeedback | null>(null);
  const optimisticBackupRef = useRef<ReturnType<typeof emptySnapshotState> | null>(null);

  const applySnapshotPayload = useCallback(
    (
      payload: Extract<CopilotRutasSnapshotApiResponse, { ok: true }>,
      workflows: OperationalWorkflowExecution[],
      operationalEvents: OperationalTimelineItem[]
    ) => {
      setSnapshot({
        generatedAt: payload.data.generatedAt,
        items: payload.data.feed.items,
        groups: payload.data.feed.groups,
        priorities: payload.data.feed.priorities,
        timeline: payload.data.timeline,
        memorySignals: payload.data.memory,
        narratives: payload.data.narratives,
        recommendations: payload.data.recommendations,
        workflows,
        operationalEvents,
        health: payload.data.health,
      });
    },
    []
  );

  const refresh = useCallback(async (options?: RutasSnapshotRefreshOptions) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [payload, workflowsPayload, eventsPayload] = await Promise.all([
        loadRutasSnapshot(Boolean(options?.fresh)),
        loadOperationalWorkflows(),
        loadOperationalEvents(),
      ]);
      if (!payload.ok) {
        if (!options?.silent) {
          setSnapshot(emptySnapshotState());
        }
        setError(payload.message);
        return;
      }
      applySnapshotPayload(
        payload,
        workflowsPayload.ok === false ? [] : workflowsPayload.workflows ?? [],
        eventsPayload.ok === false ? [] : eventsPayload.events ?? []
      );
      optimisticBackupRef.current = null;
    } catch {
      if (!options?.silent) {
        setSnapshot(emptySnapshotState());
      }
      setError("Error de red al cargar el snapshot operacional.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [applySnapshotPayload]);

  const applyOptimisticActionPatch = useCallback((patch: RutasOptimisticActionPatch) => {
    setSnapshot((prev) => {
      if (!optimisticBackupRef.current) {
        optimisticBackupRef.current = { ...prev };
      }
      return {
        ...prev,
        groups: prev.groups.map((group) => patchFeedGroup(group, patch)),
      };
    });
  }, []);

  const restoreOptimisticSnapshot = useCallback(() => {
    if (!optimisticBackupRef.current) return;
    setSnapshot(optimisticBackupRef.current);
    optimisticBackupRef.current = null;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...snapshot,
      loading,
      error,
      actionFeedback,
      refresh,
      applyOptimisticActionPatch,
      restoreOptimisticSnapshot,
      setActionFeedback,
    }),
    [
      actionFeedback,
      applyOptimisticActionPatch,
      error,
      loading,
      refresh,
      restoreOptimisticSnapshot,
      snapshot,
    ]
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
