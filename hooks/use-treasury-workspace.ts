"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";

import {
  fetchTreasuryAccounts,
  fetchTreasuryBankMovements,
  fetchTreasuryManualCash,
  fetchTreasuryObligations,
  fetchTreasuryOverdueObligations,
  fetchTreasuryUpcomingObligations,
  treasuryApiPatch,
  treasuryApiPost,
  treasuryErrorMessage,
  treasuryImportBankMovements,
  TREASURY_API,
  type BankImportResult,
  type TreasuryWorkspaceFilters,
} from "@/lib/treasury/treasury-client";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryAccount,
} from "@/lib/treasury/treasury-types";

type State = {
  accounts: TreasuryAccount[];
  manualMovements: ManualCashMovement[];
  bankMovements: BankReconciliationMovement[];
  obligations: PlannedCashObligation[];
  upcoming7: PlannedCashObligation[];
  upcoming30: PlannedCashObligation[];
  overdue: PlannedCashObligation[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
  feedback: { tone: "success" | "error"; message: string } | null;
};

type Action =
  | { type: "FETCH_START" }
  | {
      type: "FETCH_OK";
      accounts: TreasuryAccount[];
      manualMovements: ManualCashMovement[];
      bankMovements: BankReconciliationMovement[];
      obligations: PlannedCashObligation[];
      upcoming7: PlannedCashObligation[];
      upcoming30: PlannedCashObligation[];
      overdue: PlannedCashObligation[];
      ts: string;
    }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "SET_FEEDBACK"; tone: "success" | "error"; message: string }
  | { type: "CLEAR_FEEDBACK" }
  | { type: "UPSERT_ACCOUNT"; account: TreasuryAccount }
  | { type: "UPSERT_MANUAL"; movement: ManualCashMovement }
  | { type: "UPSERT_BANK"; movement: BankReconciliationMovement }
  | { type: "UPSERT_OBLIGATION"; obligation: PlannedCashObligation };

const initial: State = {
  accounts: [],
  manualMovements: [],
  bankMovements: [],
  obligations: [],
  upcoming7: [],
  upcoming30: [],
  overdue: [],
  loading: false,
  error: null,
  lastFetchedAt: null,
  feedback: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return {
        ...state,
        loading: false,
        error: null,
        accounts: action.accounts,
        manualMovements: action.manualMovements,
        bankMovements: action.bankMovements,
        obligations: action.obligations,
        upcoming7: action.upcoming7,
        upcoming30: action.upcoming30,
        overdue: action.overdue,
        lastFetchedAt: action.ts,
      };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    case "SET_FEEDBACK":
      return { ...state, feedback: { tone: action.tone, message: action.message } };
    case "CLEAR_FEEDBACK":
      return { ...state, feedback: null };
    case "UPSERT_ACCOUNT": {
      const exists = state.accounts.some((a) => a.id === action.account.id);
      return {
        ...state,
        accounts: exists
          ? state.accounts.map((a) => (a.id === action.account.id ? action.account : a))
          : [action.account, ...state.accounts],
      };
    }
    case "UPSERT_MANUAL": {
      const exists = state.manualMovements.some((m) => m.id === action.movement.id);
      return {
        ...state,
        manualMovements: exists
          ? state.manualMovements.map((m) =>
              m.id === action.movement.id ? action.movement : m
            )
          : [action.movement, ...state.manualMovements],
      };
    }
    case "UPSERT_BANK": {
      const exists = state.bankMovements.some((m) => m.id === action.movement.id);
      return {
        ...state,
        bankMovements: exists
          ? state.bankMovements.map((m) =>
              m.id === action.movement.id ? action.movement : m
            )
          : [action.movement, ...state.bankMovements],
      };
    }
    case "UPSERT_OBLIGATION": {
      const exists = state.obligations.some((o) => o.id === action.obligation.id);
      return {
        ...state,
        obligations: exists
          ? state.obligations.map((o) =>
              o.id === action.obligation.id ? action.obligation : o
            )
          : [action.obligation, ...state.obligations],
      };
    }
    default:
      return state;
  }
}

export function useTreasuryWorkspace(filters: TreasuryWorkspaceFilters) {
  const [state, dispatch] = useReducer(reducer, initial);

  const refetch = useCallback(
    async (signal?: AbortSignal) => {
      dispatch({ type: "FETCH_START" });
      try {
        const [accounts, manual, bank, obligations, upcoming7, upcoming30, overdue] =
          await Promise.all([
            fetchTreasuryAccounts(filters),
            fetchTreasuryManualCash(filters),
            fetchTreasuryBankMovements(filters),
            fetchTreasuryObligations(filters),
            fetchTreasuryUpcomingObligations(7),
            fetchTreasuryUpcomingObligations(30),
            fetchTreasuryOverdueObligations(),
          ]);
        if (signal?.aborted) return;
        const failed = [
          accounts,
          manual,
          bank,
          obligations,
          upcoming7,
          upcoming30,
          overdue,
        ].find((r) => !r.ok);
        if (failed && !failed.ok) {
          dispatch({ type: "FETCH_ERROR", error: treasuryErrorMessage(failed) });
          return;
        }
        dispatch({
          type: "FETCH_OK",
          accounts: accounts.ok ? accounts.data.items : [],
          manualMovements: manual.ok ? manual.data.items : [],
          bankMovements: bank.ok ? bank.data.items : [],
          obligations: obligations.ok ? obligations.data.items : [],
          upcoming7: upcoming7.ok ? upcoming7.data.items : [],
          upcoming30: upcoming30.ok ? upcoming30.data.items : [],
          overdue: overdue.ok ? overdue.data.items : [],
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
    [filters]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refetch(controller.signal);
    return () => controller.abort();
  }, [refetch]);

  const notify = useCallback((tone: "success" | "error", message: string) => {
    dispatch({ type: "SET_FEEDBACK", tone, message });
  }, []);

  const clearFeedback = useCallback(() => {
    dispatch({ type: "CLEAR_FEEDBACK" });
  }, []);

  const createAccount = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await treasuryApiPost<TreasuryAccount>(TREASURY_API.accounts, body);
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_ACCOUNT", account: result.data });
      notify("success", result.message);
      return result.data;
    },
    [notify]
  );

  const updateAccount = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const previous = state.accounts.find((account) => account.id === id) ?? null;
      const result = await treasuryApiPatch<TreasuryAccount>(TREASURY_API.account(id), body);
      if (!result.ok) {
        if (previous) dispatch({ type: "UPSERT_ACCOUNT", account: previous });
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_ACCOUNT", account: result.data });
      notify("success", result.message);
      return result.data;
    },
    [notify, state.accounts]
  );

  const deactivateAccount = useCallback(
    async (id: string) => {
      const previous = state.accounts.find((account) => account.id === id) ?? null;
      if (previous) {
        dispatch({ type: "UPSERT_ACCOUNT", account: { ...previous, active: false } });
      }
      const result = await treasuryApiPost<TreasuryAccount>(TREASURY_API.deactivateAccount(id), {});
      if (!result.ok) {
        if (previous) dispatch({ type: "UPSERT_ACCOUNT", account: previous });
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_ACCOUNT", account: result.data });
      notify("success", result.message);
      return result.data;
    },
    [notify, state.accounts]
  );

  const importSantanderMovements = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await treasuryImportBankMovements(body);
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      for (const movement of result.data.imported) {
        dispatch({ type: "UPSERT_BANK", movement });
      }
      notify("success", result.message);
      void refetch();
      return result.data as BankImportResult;
    },
    [notify, refetch]
  );

  const previewSantanderMovements = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await treasuryImportBankMovements({ ...body, apply: false });
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      return result.data as BankImportResult;
    },
    [notify]
  );

  const createManual = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await treasuryApiPost<ManualCashMovement>(TREASURY_API.manualCash, body);
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_MANUAL", movement: result.data });
      notify("success", result.message);
      void refetch();
      return result.data;
    },
    [notify, refetch]
  );

  const updateManual = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const result = await treasuryApiPatch<ManualCashMovement>(
        TREASURY_API.manualCashItem(id),
        body
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_MANUAL", movement: result.data });
      notify("success", result.message);
      return result.data;
    },
    [notify]
  );

  const archiveManual = useCallback(
    async (id: string) => {
      const result = await treasuryApiPost<ManualCashMovement>(
        TREASURY_API.archiveManualCash(id),
        {}
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_MANUAL", movement: result.data });
      notify("success", result.message);
      return result.data;
    },
    [notify]
  );

  const createBank = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await treasuryApiPost<BankReconciliationMovement>(
        TREASURY_API.bankMovements,
        body
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_BANK", movement: result.data });
      notify("success", result.message);
      void refetch();
      return result.data;
    },
    [notify, refetch]
  );

  const matchBank = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const previous = state.bankMovements.find((movement) => movement.id === id) ?? null;
      if (previous) {
        dispatch({
          type: "UPSERT_BANK",
          movement: {
            ...previous,
            matched: true,
            matchStatus: "matched",
            matchedSource: "manual_cash",
            matchedRecordId:
              typeof body.matched_record_id === "string" ? body.matched_record_id : null,
            confidence:
              typeof body.confidence === "number" ? body.confidence : previous.confidence,
          },
        });
      }
      const result = await treasuryApiPost<BankReconciliationMovement>(
        TREASURY_API.matchBank(id),
        body
      );
      if (!result.ok) {
        if (previous) dispatch({ type: "UPSERT_BANK", movement: previous });
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_BANK", movement: result.data });
      notify("success", result.message);
      return result.data;
    },
    [notify, state.bankMovements]
  );

  const ignoreBank = useCallback(
    async (id: string, notes?: string | null) => {
      const previous = state.bankMovements.find((movement) => movement.id === id) ?? null;
      if (previous) {
        dispatch({
          type: "UPSERT_BANK",
          movement: {
            ...previous,
            matched: false,
            matchStatus: "ignored",
            matchedSource: "none",
            matchedRecordId: null,
            confidence: null,
          },
        });
      }
      const result = await treasuryApiPost<BankReconciliationMovement>(
        TREASURY_API.ignoreBank(id),
        { notes: notes ?? null }
      );
      if (!result.ok) {
        if (previous) dispatch({ type: "UPSERT_BANK", movement: previous });
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_BANK", movement: result.data });
      notify("success", result.message);
      return result.data;
    },
    [notify, state.bankMovements]
  );

  const createObligation = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await treasuryApiPost<PlannedCashObligation>(
        TREASURY_API.obligations,
        body
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_OBLIGATION", obligation: result.data });
      notify("success", result.message);
      void refetch();
      return result.data;
    },
    [notify, refetch]
  );

  const updateObligation = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const result = await treasuryApiPatch<PlannedCashObligation>(
        TREASURY_API.obligation(id),
        body
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_OBLIGATION", obligation: result.data });
      notify("success", result.message);
      void refetch();
      return result.data;
    },
    [notify, refetch]
  );

  const confirmObligation = useCallback(
    async (id: string) => {
      const result = await treasuryApiPost<PlannedCashObligation>(
        TREASURY_API.confirmObligation(id),
        {}
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_OBLIGATION", obligation: result.data });
      notify("success", result.message);
      void refetch();
      return result.data;
    },
    [notify, refetch]
  );

  const paidObligation = useCallback(
    async (id: string, amountFinal?: number) => {
      const result = await treasuryApiPost<PlannedCashObligation>(
        TREASURY_API.paidObligation(id),
        amountFinal != null ? { amount_final: amountFinal } : {}
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_OBLIGATION", obligation: result.data });
      notify("success", result.message);
      void refetch();
      return result.data;
    },
    [notify, refetch]
  );

  const cancelObligation = useCallback(
    async (id: string) => {
      const result = await treasuryApiPost<PlannedCashObligation>(
        TREASURY_API.cancelObligation(id),
        {}
      );
      if (!result.ok) {
        notify("error", treasuryErrorMessage(result));
        return null;
      }
      dispatch({ type: "UPSERT_OBLIGATION", obligation: result.data });
      notify("success", result.message);
      void refetch();
      return result.data;
    },
    [notify, refetch]
  );

  const accountById = useMemo(
    () => new Map(state.accounts.map((a) => [a.id, a])),
    [state.accounts]
  );

  return {
    ...state,
    accountById,
    refetch,
    notify,
    clearFeedback,
    createAccount,
    updateAccount,
    deactivateAccount,
    importSantanderMovements,
    previewSantanderMovements,
    createManual,
    updateManual,
    archiveManual,
    createBank,
    matchBank,
    ignoreBank,
    createObligation,
    updateObligation,
    confirmObligation,
    paidObligation,
    cancelObligation,
  };
}

export type TreasuryWorkspace = ReturnType<typeof useTreasuryWorkspace>;
