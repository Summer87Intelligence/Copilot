"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

export type ThemeValue = "light" | "dark";

interface ThemeContextType {
  theme: ThemeValue;
  setTheme: (t: ThemeValue) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "theme";
const LEGACY_STORAGE_KEY = "copilot-theme";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

function notifyThemeChange() {
  for (const listener of listeners) {
    listener();
  }
}

function isValidTheme(value: string | null): value is ThemeValue {
  return value === "light" || value === "dark";
}

function readStoredTheme(): ThemeValue {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidTheme(stored)) return stored;

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (isValidTheme(legacy)) {
      localStorage.setItem(STORAGE_KEY, legacy);
      return legacy;
    }
  } catch {}
  return "light";
}

function getThemeSnapshot(): ThemeValue {
  return readStoredTheme();
}

function getServerThemeSnapshot(): ThemeValue {
  return "light";
}

function applyThemeToDom(theme: ThemeValue) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeValue) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    applyThemeToDom(t);
    notifyThemeChange();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
