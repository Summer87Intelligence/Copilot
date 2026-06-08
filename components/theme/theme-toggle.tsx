"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type ThemeValue } from "@/components/theme/theme-provider";

const CYCLE: ThemeValue[] = ["system", "light", "dark"];

const LABELS: Record<ThemeValue, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  function handleClick() {
    const idx = CYCLE.indexOf(theme);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  }

  const Icon =
    theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Tema: ${LABELS[theme]}`}
      title={`Tema: ${LABELS[theme]}`}
      className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-hover-bg)] hover:text-[var(--copilot-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--copilot-accent)]"
    >
      <Icon className="h-[17px] w-[17px]" aria-hidden />
    </button>
  );
}
