"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { DailyBriefing, DECollectionAction } from "@/lib/decision-engine/de-types";
import { DailyBriefingCard } from "@/components/copilot/decision-engine/daily-briefing-card";

type BriefingResponse = {
  ok: true;
  briefing: DailyBriefing;
  recentActions: DECollectionAction[];
  cached: boolean;
  generated_at: string;
} | {
  ok: false;
  code: string;
  message: string;
};

export function DecisionesShell() {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [recentActions, setRecentActions] = useState<DECollectionAction[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = force
        ? "/api/copilot/decision-engine/briefing?force=true"
        : "/api/copilot/decision-engine/briefing";
      const res = await copilotApiFetch(url);
      const json = (await res.json()) as BriefingResponse;

      if (!json.ok) {
        setError((json as { message?: string }).message ?? "Error al cargar el motor de decisiones");
        return;
      }

      setBriefing(json.briefing);
      setRecentActions(json.recentActions ?? []);
      setGeneratedAt(json.generated_at);
      setCached(json.cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBriefing(false);
  }, [fetchBriefing]);

  if (loading && !briefing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--copilot-text-muted)]">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Analizando cartera…</p>
      </div>
    );
  }

  if (error && !briefing) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 flex gap-3">
        <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-rose-800">Error al cargar el motor de decisiones</p>
          <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          <button
            type="button"
            onClick={() => void fetchBriefing(false)}
            className="mt-2 text-xs font-medium text-rose-700 hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <DailyBriefingCard
      briefing={briefing}
      recentActions={recentActions}
      generatedAt={generatedAt}
      cached={cached}
      refreshing={loading}
      onRefresh={() => void fetchBriefing(true)}
    />
  );
}
