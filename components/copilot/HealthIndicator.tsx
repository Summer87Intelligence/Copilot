"use client";

import { useMemo } from "react";
import Link from "next/link";

export type HealthAlertSeverity = "critical" | "high" | "medium" | "low";

export type HealthIndicatorAlert = {
  id: string;
  title: string;
  severity: HealthAlertSeverity;
};

function alertasHrefFromCounts(critical: number, high: number): string {
  if (critical > 0) return "/copilot/atencion-prioritaria?level=critical";
  if (high > 0) return "/copilot/atencion-prioritaria?level=high";
  return "/copilot/alertas";
}

/**
 * Clic → atención prioritaria si hay críticas o altas; si no, listado general de alertas.
 */
export function HealthIndicator({
  alerts,
  loading = false,
}: {
  alerts: HealthIndicatorAlert[];
  loading?: boolean;
}) {
  const counts = useMemo(() => {
    let critical = 0;
    let high = 0;
    for (const a of alerts) {
      if (a.severity === "critical") critical += 1;
      else if (a.severity === "high") high += 1;
    }
    return { critical, high };
  }, [alerts]);

  const health = useMemo(() => {
    if (counts.critical >= 1) {
      return {
        dotClass: "bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.25)]",
        label: "Crítica",
        labelClass: "text-rose-950",
      };
    }
    if (counts.high >= 1) {
      return {
        dotClass: "bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]",
        label: "Riesgo",
        labelClass: "text-amber-950",
      };
    }
    return {
      dotClass: "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]",
      label: "OK",
      labelClass: "text-emerald-900",
    };
  }, [counts]);

  const href = useMemo(
    () => alertasHrefFromCounts(counts.critical, counts.high),
    [counts.critical, counts.high]
  );

  const counterLine = `${counts.critical} crítica${counts.critical === 1 ? "" : "s"} · ${counts.high} alta${counts.high === 1 ? "" : "s"}`;

  return (
    <div className="flex justify-end overflow-visible">
      <Link
        href={href}
        scroll={false}
        className="flex max-w-full items-center gap-2.5 rounded-xl border border-[var(--copilot-border)] bg-white/80 px-3 py-2 text-left shadow-sm ring-1 ring-[rgba(44,40,37,0.04)] transition-colors duration-200 hover:bg-white hover:ring-[rgba(31,107,74,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
        aria-label={
          counts.critical >= 1 || counts.high >= 1
            ? `Ir a atención prioritaria. Salud: ${health.label}. ${counterLine}`
            : `Ir a alertas. Salud: ${health.label}. ${counterLine}`
        }
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            loading ? "animate-pulse bg-slate-300 shadow-none" : health.dotClass
          }`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--copilot-ink)]">
            Salud:{" "}
            <span
              className={
                loading ? "text-[var(--copilot-ink-muted)]" : health.labelClass
              }
            >
              {loading ? "…" : health.label}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-medium text-[var(--copilot-ink-muted)]">
            {counterLine}
          </span>
        </span>
      </Link>
    </div>
  );
}
