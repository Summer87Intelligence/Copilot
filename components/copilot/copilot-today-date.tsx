"use client";

import { Calendar } from "lucide-react";
import { useEffect, useState } from "react";

import { formatCopilotDate } from "@/lib/copilot-format";

function formatFull(d: Date): string {
  return formatCopilotDate(d, "header");
}

function formatShort(d: Date): string {
  return formatCopilotDate(d, "text");
}

export function TodayDateDisplay() {
  const [date, setDate] = useState<Date | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setDate(new Date()));
  }, []);

  if (!date) {
    return (
      <div className="h-4 w-44 animate-pulse rounded-md bg-[var(--copilot-border)]" />
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
      <Calendar
        className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-accent)]"
        aria-hidden
      />
      <span className="hidden whitespace-nowrap font-medium text-[var(--copilot-ink)] sm:inline">
        {formatFull(date)}
      </span>
      <span className="whitespace-nowrap font-medium text-[var(--copilot-ink)] sm:hidden">
        {formatShort(date)}
      </span>
    </div>
  );
}
