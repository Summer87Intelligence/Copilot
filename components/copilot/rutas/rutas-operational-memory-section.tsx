"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { buildOperationalActionHref } from "@/lib/copilot-alert-ops-mapper";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";

const SEVERITY_LABEL: Record<OperationalMemorySignal["severity"], string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

function severityTone(
  severity: OperationalMemorySignal["severity"]
): "neutral" | "warning" | "danger" | "success" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  return "neutral";
}

function MemorySignalCard({ signal }: { signal: OperationalMemorySignal }) {
  const actionId = signal.relatedActionIds?.[0];

  return (
    <CopilotCard className="border border-dashed border-[var(--copilot-border)]/80 bg-white/70 p-2 shadow-none">
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Arrastre
        </span>
        <CopilotBadge tone={severityTone(signal.severity)}>{SEVERITY_LABEL[signal.severity]}</CopilotBadge>
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-[var(--copilot-ink)]">
          {signal.title}
        </p>
        {actionId ? (
          <Link
            href={buildOperationalActionHref(actionId)}
            className="shrink-0 text-[10px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 hover:text-[var(--copilot-ink)] hover:underline"
          >
            Abrir seguimiento
          </Link>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]">{signal.summary}</p>
      {signal.evidence.length > 0 ? (
        <ul className="mt-0.5 space-y-px text-[10px] leading-snug text-[var(--copilot-ink-muted)]">
          {signal.evidence.slice(0, 2).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </CopilotCard>
  );
}

export function RutasOperationalMemorySection() {
  const [signals, setSignals] = useState<OperationalMemorySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await copilotApiFetch("/api/copilot/operational-memory");
      const json = (await res.json()) as {
        signals?: OperationalMemorySignal[];
        error?: string;
      };
      if (!res.ok) {
        setSignals([]);
        setError(json.error ?? "No se pudo leer la memoria operacional.");
        return;
      }
      setSignals(json.signals ?? []);
    } catch {
      setSignals([]);
      setError("Error de red al leer la memoria operacional.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const preview = useMemo(() => signals.slice(0, 3), [signals]);

  return (
    <section className="space-y-1">
      <CopilotSectionTitle
        title="Continuidad operacional"
        subtitle="Memoria, repetición y cambios recientes."
      />

      {error ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Leyendo continuidad operacional…
        </div>
      ) : preview.length === 0 ? (
        <p className="text-[11px] text-[var(--copilot-ink-muted)]">Sin arrastre operativo relevante.</p>
      ) : (
        <ul className="space-y-1">
          {preview.map((signal) => (
            <li key={signal.id}>
              <MemorySignalCard signal={signal} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
