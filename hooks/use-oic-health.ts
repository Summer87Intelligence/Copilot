"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { OicHealthDashboardData } from "@/lib/operacional/types";

type State = {
  data: OicHealthDashboardData | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  lastFetchedAt: string | null;
  refreshTick: number;
};

type Action =
  | { type: "request" }
  | { type: "success"; data: OicHealthDashboardData; fetchedAt: string }
  | { type: "error"; message: string; code: string }
  | { type: "refetch" };

const INITIAL: State = {
  data: null,
  loading: false,
  error: null,
  errorCode: null,
  lastFetchedAt: null,
  refreshTick: 0,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "request":
      return { ...state, loading: true, error: null, errorCode: null };
    case "success":
      return { ...state, loading: false, error: null, errorCode: null, data: action.data, lastFetchedAt: action.fetchedAt };
    case "error":
      return { ...state, loading: false, error: action.message, errorCode: action.code };
    case "refetch":
      return { ...state, refreshTick: state.refreshTick + 1 };
  }
}

export type UseOicHealthResult = {
  data: OicHealthDashboardData | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  lastFetchedAt: string | null;
  refetch: () => void;
};

export function useOicHealth(enabled = true): UseOicHealthResult {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const refetch = useCallback(() => dispatch({ type: "refetch" }), []);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    dispatch({ type: "request" });

    fetch("/api/operacional/health", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (ac.signal.aborted) return;
        if (!res.ok || !json?.ok) {
          dispatch({ type: "error", message: json?.error ?? `HTTP ${res.status}`, code: json?.code ?? `HTTP_${res.status}` });
          return;
        }
        dispatch({ type: "success", data: json.data, fetchedAt: json.computedAt ?? new Date().toISOString() });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        dispatch({ type: "error", message: err instanceof Error ? err.message : "Error de red", code: "NETWORK_ERROR" });
      });

    return () => ac.abort();
  }, [enabled, state.refreshTick]);

  return { data: state.data, loading: state.loading, error: state.error, errorCode: state.errorCode, lastFetchedAt: state.lastFetchedAt, refetch };
}
