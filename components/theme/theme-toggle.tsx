"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme/theme-provider";

const LABELS = {
  light: "Cambiar a modo oscuro",
  dark: "Cambiar a modo claro",
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function handleClick() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  const Icon = theme === "dark" ? Moon : Sun;
  const label = LABELS[theme];

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-hover-bg)] hover:text-[var(--copilot-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--copilot-accent)]"
    >
      <Icon className="h-[17px] w-[17px]" aria-hidden />
    </button>
  );
}
