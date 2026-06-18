"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  type CurrencyDisplayMode,
  DEFAULT_CURRENCY_DISPLAY_MODE,
  DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD,
  readDisplayFxRateFromStorage,
  readDisplayModeFromStorage,
  writeDisplayFxRateToStorage,
  writeDisplayModeToStorage,
} from "@/lib/currency-display-mode";

type DisplayCurrencyContextType = {
  mode: CurrencyDisplayMode;
  fxRate: number;
  setMode: (m: CurrencyDisplayMode) => void;
  setFxRate: (rate: number) => void;
};

const DisplayCurrencyContext = createContext<DisplayCurrencyContextType>({
  mode: DEFAULT_CURRENCY_DISPLAY_MODE,
  fxRate: DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD,
  setMode: () => {},
  setFxRate: () => {},
});

export function useDisplayCurrency() {
  return useContext(DisplayCurrencyContext);
}

// --- useSyncExternalStore plumbing (cross-tab via storage events) ---

const modeListeners = new Set<() => void>();
const fxListeners = new Set<() => void>();

function subscribeModeStore(cb: () => void) {
  modeListeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    modeListeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

function subscribeFxStore(cb: () => void) {
  fxListeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    fxListeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

function notifyMode() {
  for (const cb of modeListeners) cb();
}

function notifyFx() {
  for (const cb of fxListeners) cb();
}

const getModeSnapshot = () => readDisplayModeFromStorage();
const getServerModeSnapshot = () => DEFAULT_CURRENCY_DISPLAY_MODE;
const getFxSnapshot = () => readDisplayFxRateFromStorage();
const getServerFxSnapshot = () => DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;

// ---

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribeModeStore, getModeSnapshot, getServerModeSnapshot);
  const fxRate = useSyncExternalStore(subscribeFxStore, getFxSnapshot, getServerFxSnapshot);

  const setMode = useCallback((m: CurrencyDisplayMode) => {
    writeDisplayModeToStorage(m);
    notifyMode();
  }, []);

  const setFxRate = useCallback((rate: number) => {
    if (rate <= 0) return;
    writeDisplayFxRateToStorage(rate);
    notifyFx();
  }, []);

  // Keep in sync when another tab writes
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === null) {
        notifyMode();
        notifyFx();
        return;
      }
      if (e.key === "copilot.currencyDisplayMode") notifyMode();
      if (e.key === "copilot.currencyDisplayFxRate") notifyFx();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <DisplayCurrencyContext.Provider value={{ mode, fxRate, setMode, setFxRate }}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}
