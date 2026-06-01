"use client";

import { useCallback, useState } from "react";
import { copilotApiFetch } from "@/lib/copilot-fetch";

export function usePdfDownload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const download = useCallback(async (url: string, defaultFilename: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await copilotApiFetch(url);
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? "No se pudo generar el PDF.");
        return false;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.href = objectUrl;
      a.download = match?.[1] ?? defaultFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al descargar el PDF.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, clearError, download };
}
