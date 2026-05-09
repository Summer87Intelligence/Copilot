"use client";

import { useCallback, useEffect, useReducer } from "react";

import {
  COLLECTION_API,
  type CollectionAction,
  type CollectionActionInput,
  type CollectionActionPatch,
} from "@/lib/copilot-collection-types";

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

type State = {
  actions: CollectionAction[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
};

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK"; actions: CollectionAction[]; ts: string }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "UPSERT"; action: CollectionAction }
  | { type: "REMOVE"; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return { actions: action.actions, loading: false, error: null, lastFetchedAt: action.ts };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    case "UPSERT": {
      const exists = state.actions.some((a) => a.id === action.action.id);
      const actions = exists
        ? state.actions.map((a) => (a.id === action.action.id ? action.action : a))
        : [action.action, ...state.actions];
      return { ...state, actions };
    }
    case "REMOVE":
      return { ...state, actions: state.actions.filter((a) => a.id !== action.id) };
    default:
      return state;
  }
}

const initial: State = { actions: [], loading: false, error: null, lastFetchedAt: null };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCollectionActions(companyId: string | null) {
  const [state, dispatch] = useReducer(reducer, initial);

  const fetchActions = useCallback(
    async (signal?: AbortSignal) => {
      if (!companyId) return;
      dispatch({ type: "FETCH_START" });
      try {
        const res = await fetch(COLLECTION_API.listByCompany(companyId), { signal });
        if (signal?.aborted) return;
        if (!res.ok) {
          dispatch({ type: "FETCH_ERROR", error: "Error al cargar acciones." });
          return;
        }
        const json = await res.json();
        if (!json.ok) {
          dispatch({ type: "FETCH_ERROR", error: json.message ?? "Error desconocido." });
          return;
        }
        dispatch({
          type: "FETCH_OK",
          actions: json.actions ?? [],
          ts: new Date().toISOString(),
        });
      } catch (err) {
        if (signal?.aborted) return;
        dispatch({
          type: "FETCH_ERROR",
          error: err instanceof Error ? err.message : "Error de red.",
        });
      }
    },
    [companyId]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchActions(controller.signal);
    return () => controller.abort();
  }, [fetchActions]);

  // ---------------------------------------------------------------------------
  // Mutaciones
  // ---------------------------------------------------------------------------

  const create = useCallback(
    async (input: CollectionActionInput): Promise<CollectionAction | null> => {
      try {
        const body: Record<string, unknown> = {
          company_id: input.companyId,
          action_type: input.actionType,
          status: input.status ?? "pending_review",
          priority: input.priority ?? "medium",
          assigned_to: input.assignedTo ?? null,
          created_by: input.createdBy ?? null,
          due_date: input.dueDate ?? null,
          contact_date: input.contactDate ?? null,
          next_action_date: input.nextActionDate ?? null,
          promise_date: input.promiseDate ?? null,
          promise_amount: input.promiseAmount ?? null,
          promise_currency: input.promiseCurrency ?? null,
          notes: input.notes ?? null,
          metadata: input.metadata ?? null,
        };
        const res = await fetch(COLLECTION_API.create, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.ok) return null;
        dispatch({ type: "UPSERT", action: json.data });
        return json.data;
      } catch {
        return null;
      }
    },
    []
  );

  const update = useCallback(
    async (id: string, patch: CollectionActionPatch): Promise<CollectionAction | null> => {
      try {
        const body: Record<string, unknown> = {
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.actionType !== undefined && { action_type: patch.actionType }),
          ...(patch.priority !== undefined && { priority: patch.priority }),
          ...(patch.assignedTo !== undefined && { assigned_to: patch.assignedTo }),
          ...(patch.dueDate !== undefined && { due_date: patch.dueDate }),
          ...(patch.contactDate !== undefined && { contact_date: patch.contactDate }),
          ...(patch.nextActionDate !== undefined && { next_action_date: patch.nextActionDate }),
          ...(patch.promiseDate !== undefined && { promise_date: patch.promiseDate }),
          ...(patch.promiseAmount !== undefined && { promise_amount: patch.promiseAmount }),
          ...(patch.promiseCurrency !== undefined && { promise_currency: patch.promiseCurrency }),
          ...(patch.notes !== undefined && { notes: patch.notes }),
          ...(patch.metadata !== undefined && { metadata: patch.metadata }),
        };
        const res = await fetch(COLLECTION_API.update(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.ok) return null;
        dispatch({ type: "UPSERT", action: json.data });
        return json.data;
      } catch {
        return null;
      }
    },
    []
  );

  const archive = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(COLLECTION_API.archive(id), { method: "POST" });
      const json = await res.json();
      if (!json.ok) return false;
      dispatch({ type: "REMOVE", id });
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    actions: state.actions,
    loading: state.loading,
    error: state.error,
    lastFetchedAt: state.lastFetchedAt,
    refetch: () => fetchActions(),
    create,
    update,
    archive,
  };
}
