"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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

function isValidTheme(value: string | null): value is ThemeValue {
  return value === "light" || value === "dark";
}

function getInitialTheme(): ThemeValue {
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

function applyThemeToDom(theme: ThemeValue) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeValue>(getInitialTheme);

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeValue) => {
    setThemeState(t);
    applyThemeToDom(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
