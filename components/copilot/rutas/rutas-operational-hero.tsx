"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";

type HeroStyle = {
  bg: string;
  dot: string;
  label: string;
  labelClass: string;
};

function heroStyle(status: "critical" | "warning" | "stable"): HeroStyle {
  if (status === "critical") {
    return {
      bg: "border-rose-200/70 bg-rose-50/50",
      dot: "bg-rose-500",
      label: "Requiere atención inmediata",
      labelClass: "text-rose-700",
    };
  }
  if (status === "warning") {
    return {
      bg: "border-amber-200/60 bg-amber-50/40",
      dot: "bg-amber-400",
      label: "Hay situaciones a revisar",
      labelClass: "text-amber-700",
    };
  }
  return {
    bg: "border-emerald-200/50 bg-emerald-50/30",
    dot: "bg-emerald-400",
    label: "Todo operando bien",
    labelClass: "text-emerald-700",
  };
}

export function RutasOperationalHero() {
  const { executiveBriefing, loading } = useRutasOperationalFeedSnapshot();

  if (loading && !executiveBriefing) {
    return (
      <div className="rounded-2xl border border-[var(--copilot-border)]/40 bg-[var(--copilot-card-bg)]/60 px-4 py-5">
        <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--copilot-border)]/25" />
        <div className="mt-3 h-5 w-3/4 animate-pulse rounded-full bg-[var(--copilot-border)]/20" />
        <div className="mt-2 h-4 w-1/2 animate-pulse rounded-full bg-[var(--copilot-border)]/15" />
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-[var(--copilot-border)]/10" />
        <div className="mt-3 h-8 w-32 animate-pulse rounded-xl bg-[var(--copilot-border)]/15" />
      </div>
    );
  }

  if (!executiveBriefing) return null;

  const { bg, dot, label, labelClass } = heroStyle(executiveBriefing.status);
  const mainAction = executiveBriefing.doFirst[0];
  const impact = executiveBriefing.whyItMatters[0];
  const ctaHref = mainAction?.href ?? "/copilot/rutas";

  return (
    <div className={`rounded-2xl border px-4 py-5 ${bg}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>
          {label}
        </span>
      </div>

      <p className="mt-2.5 text-[15px] font-semibold leading-snug text-[var(--copilot-ink)]">
        {executiveBriefing.headline}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--copilot-ink-muted)]">
        {executiveBriefing.summary}
      </p>

      {mainAction ? (
        <div className="mt-4 rounded-xl border border-[var(--copilot-border)]/50 bg-[var(--copilot-card-bg)]/75 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Tu siguiente paso
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[var(--copilot-ink)]">
            {mainAction.title}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{mainAction.reason}</p>
          {impact ? (
            <p className="mt-2 text-[10px] text-[var(--copilot-ink-muted)]">
              <span className="font-semibold text-[var(--copilot-ink)]">Impacto esperado:</span>{" "}
              {impact}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Empezar ahora
        </Link>
      </div>
    </div>
  );
}
