"use client";

/**
 * useFinancialReconciliation
 * --------------------------
 * Cliente delgado para `GET /api/copilot/financial-reconciliation`.
 *
 * Diseño:
 *  - Un solo `useEffect` con `AbortController` por request → sin race conditions.
 *  - Estado consolidado vía `useReducer` para que cada transición sea atómica
 *    (evita cascading renders y respeta `react-hooks/set-state-in-effect`).
 *  - Sin recalcular nada en frontend: solo transporta el reporte tal cual lo
 *    devuelve el backend (fuente única de verdad financiera).
 *  - `refetch()` reutilizable para el botón Refresh del control bar.
 *  - Sin libs externas para mantener bundle chico (no `swr` ni `react-query`).
 *
 * Reglas:
 *  - No swallow de errores: se exponen `error` y `errorCode` para la UI.
 *  - Mode `period_only` requiere `periodStart` y `periodEnd` (validado en cliente
 *    para evitar requests inútiles que devolverían 400).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type {
  FinancialConsistencyReport,
  ReconciliationMode,
} from "@/lib/copilot-financial-reconciliation";

export type UseFinancialReconciliationParams = {
  mode?: ReconciliationMode;
  /** YYYY-MM-DD inclusivo. Requerido si mode === 'period_only'. */
  periodStart?: string | null;
  /** YYYY-MM-DD inclusivo. Requerido si mode === 'period_only'. */
  periodEnd?: string | null;
  /** Si false, el hook no dispara fetch (útil para deshabilitar temporalmente). */
  enabled?: boolean;
  /** Milisegundos antes de abortar el fetch y emitir error TIMEOUT. 0 = sin límite. Default: 25000. */
  timeoutMs?: number;
};

export type FinancialReconciliationApiResponse = {
  ok: true;
  report: FinancialConsistencyReport;
  meta: {
    invoice_limit: number;
    invoices_loaded: number;
    truncated: boolean;
  };
};

export type UseFinancialReconciliationResult = {
  report: FinancialConsistencyReport | null;
  meta: FinancialReconciliationApiResponse["meta"] | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  /** Timestamp ISO del último fetch exitoso. Útil para "Última sync hace X". */
  lastFetchedAt: string | null;
  refetch: () => void;
};

const RECONCILIATION_ENDPOINT = "/api/copilot/financial-reconciliation";
const PERIOD_RX = /^\d{4}-\d{2}-\d{2}$/;

type FetchState = {
  report: FinancialConsistencyReport | null;
  meta: FinancialReconciliationApiResponse["meta"] | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  lastFetchedAt: string | null;
  refreshTick: number;
};

type FetchAction =
  | { type: "request" }
  | {
      type: "success";
      report: FinancialConsistencyReport;
      meta: FinancialReconciliationApiResponse["meta"];
      fetchedAt: string;
    }
  | { type: "error"; message: string; code: string }
  | { type: "refetch" }
  | { type: "params_changed" };

const INITIAL_STATE: FetchState = {
  report: null,
  meta: null,
  loading: false,
  error: null,
  errorCode: null,
  lastFetchedAt: null,
  refreshTick: 0,
};

function reducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case "request":
      return { ...state, loading: true, error: null, errorCode: null };
    case "success":
      return {
        ...state,
        loading: false,
        error: null,
        errorCode: null,
        report: action.report,
        meta: action.meta,
        lastFetchedAt: action.fetchedAt,
      };
    case "error":
      return {
        ...state,
        loading: false,
        report: null,
        meta: null,
        error: action.message,
        errorCode: action.code,
      };
    case "refetch":
      return { ...state, refreshTick: state.refreshTick + 1 };
    case "params_changed":
      // Al cambiar el rango/mode el reporte previo queda obsoleto: pertenecía
      // a OTRO período. Limpiamos para que la UI muestre skeleton/empty en
      // lugar de mezclar montos del rango anterior con counts del nuevo.
      return { ...INITIAL_STATE, refreshTick: state.refreshTick };
    default:
      return state;
  }
}

function buildUrl(params: UseFinancialReconciliationParams): string {
  const search = new URLSearchParams();
  if (params.mode) search.set("mode", params.mode);
  if (params.mode === "period_only") {
    if (params.periodStart) search.set("period_start", params.periodStart);
    if (params.periodEnd) search.set("period_end", params.periodEnd);
  }
  const qs = search.toString();
  return qs ? `${RECONCILIATION_ENDPOINT}?${qs}` : RECONCILIATION_ENDPOINT;
}

function isPeriodReady(params: UseFinancialReconciliationParams): boolean {
  if (params.mode !== "period_only") return true;
  return (
    !!params.periodStart &&
    !!params.periodEnd &&
    PERIOD_RX.test(params.periodStart) &&
    PERIOD_RX.test(params.periodEnd)
  );
}

const DEFAULT_TIMEOUT_MS = 25_000;

export function useFinancialReconciliation(
  params: UseFinancialReconciliationParams = {}
): UseFinancialReconciliationResult {
  const {
    mode = "period_only",
    periodStart = null,
    periodEnd = null,
    enabled = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;

  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const refetch = useCallback(() => dispatch({ type: "refetch" }), []);
  const abortRef = useRef<AbortController | null>(null);
  const lastParamsKeyRef = useRef<string | null>(null);

  // Clave única por combinación efectiva de parámetros. Cuando cambia,
  // descartamos el reporte previo para no mezclar rangos.
  const paramsKey = useMemo(
    () => `${mode}|${periodStart ?? ""}|${periodEnd ?? ""}`,
    [mode, periodStart, periodEnd]
  );

  useEffect(() => {
    if (!enabled) return;
    if (!isPeriodReady({ mode, periodStart, periodEnd })) return;

    // Si los parámetros efectivos cambiaron respecto al último fetch en vuelo,
    // limpiamos el reporte anterior antes de iniciar el nuevo. Esto evita el
    // estado "counts del rango nuevo + montos del rango viejo" que ocurría
    // mientras la respuesta del nuevo rango está en vuelo.
    if (
      lastParamsKeyRef.current !== null &&
      lastParamsKeyRef.current !== paramsKey
    ) {
      dispatch({ type: "params_changed" });
    }
    lastParamsKeyRef.current = paramsKey;

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    dispatch({ type: "request" });

    const url = buildUrl({ mode, periodStart, periodEnd });

    // Timeout guard: si el endpoint no responde en timeoutMs, abortamos y
    // emitimos error TIMEOUT para que la UI salga del skeleton infinito.
    let timedOut = false;
    const timeoutId =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            ac.abort();
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[useFinancialReconciliation] TIMEOUT after ${timeoutMs}ms — url: ${url}`
              );
            }
            dispatch({
              type: "error",
              message:
                "El reporte financiero tardó demasiado en responder. Verificá la conexión y reintentá.",
              code: "TIMEOUT",
            });
          }, timeoutMs)
        : null;

    fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (ac.signal.aborted) return;

        const json = (await res.json().catch(() => null)) as
          | FinancialReconciliationApiResponse
          | { ok: false; code?: string; message?: string }
          | null;

        if (ac.signal.aborted) return;

        if (!res.ok || !json || (json as { ok: boolean }).ok !== true) {
          const code =
            (json && "code" in json && typeof json.code === "string"
              ? json.code
              : null) ?? `HTTP_${res.status}`;
          const message =
            (json && "message" in json && typeof json.message === "string"
              ? json.message
              : null) ?? `Error ${res.status} al cargar reconciliación financiera.`;
          dispatch({ type: "error", message, code });
          return;
        }

        const ok = json as FinancialReconciliationApiResponse;
        dispatch({
          type: "success",
          report: ok.report,
          meta: ok.meta,
          fetchedAt: new Date().toISOString(),
        });
      })
      .catch((err: unknown) => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        // Si el timeout ya manejó el error, no volvemos a dispatchar.
        if (timedOut) return;
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Error de red al cargar reconciliación.";
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useFinancialReconciliation] network error:", message);
        }
        dispatch({ type: "error", message, code: "NETWORK_ERROR" });
      });

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      ac.abort();
    };
  }, [mode, periodStart, periodEnd, enabled, state.refreshTick, paramsKey, timeoutMs]);

  return {
    report: state.report,
    meta: state.meta,
    loading: state.loading,
    error: state.error,
    errorCode: state.errorCode,
    lastFetchedAt: state.lastFetchedAt,
    refetch,
  };
}
