"use client";

import { useEffect, useReducer } from "react";

import type {
  ClientPaymentProfile,
  InvoicePaymentProjection,
  PaymentProjectionSummary,
} from "@/lib/payment-behavior/payment-behavior-engine";

export type PaymentBehaviorProjectionState = {
  loading: boolean;
  error: string | null;
  summaries: PaymentProjectionSummary[];
  projections: InvoicePaymentProjection[];
  profiles: ClientPaymentProfile[];
  lastFetchedAt: string | null;
};

type Action =
  | { type: "FETCH_START" }
  | {
      type: "FETCH_OK";
      summaries: PaymentProjectionSummary[];
      projections: InvoicePaymentProjection[];
      profiles: ClientPaymentProfile[];
      ts: string;
    }
  | { type: "FETCH_ERR"; error: string };

function reducer(
  state: PaymentBehaviorProjectionState,
  action: Action
): PaymentBehaviorProjectionState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return {
        loading: false,
        error: null,
        summaries: action.summaries,
        projections: action.projections,
        profiles: action.profiles,
        lastFetchedAt: action.ts,
      };
    case "FETCH_ERR":
      return { ...state, loading: false, error: action.error };
  }
}

const INITIAL_STATE: PaymentBehaviorProjectionState = {
  loading: false,
  error: null,
  summaries: [],
  projections: [],
  profiles: [],
  lastFetchedAt: null,
};

export function usePaymentBehaviorProjection({ enabled = true }: { enabled?: boolean } = {}) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    dispatch({ type: "FETCH_START" });

    fetch("/api/copilot/payment-behavior/projection")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          ok: boolean;
          summaries: PaymentProjectionSummary[];
          projections: InvoicePaymentProjection[];
          profiles: ClientPaymentProfile[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) throw new Error("API returned ok:false");
        dispatch({
          type: "FETCH_OK",
          summaries: data.summaries ?? [],
          projections: data.projections ?? [],
          profiles: data.profiles ?? [],
          ts: new Date().toISOString(),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "FETCH_ERR",
          error: err instanceof Error ? err.message : "Error desconocido",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
