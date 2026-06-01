"use client";

import { useEffect, useState } from "react";
import { copilotApiFetch } from "@/lib/copilot-fetch";

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useReportFetch<T>(url: string | null): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void copilotApiFetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as { error?: string };
          if (!cancelled) setError(json.error ?? "No se pudo cargar el reporte.");
          return;
        }
        const json = await res.json() as { ok: boolean; model?: T };
        if (!cancelled) setData(json.model ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error al cargar el reporte.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading, error };
}
