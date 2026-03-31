/**
 * Modo de ejecución del Copilot / dashboard.
 *
 * - `live`: datos desde Supabase (flujo productivo).
 * - `zeta-sim-*`: datasets mock vía pipeline Zeta → snapshot (sin DB).
 *
 * Control: variable de entorno `NEXT_PUBLIC_COPILOT_MODE` (valor en build del cliente).
 * Sin definir o con valor desconocido → `live`.
 */

export type CopilotMode =
  | "live"
  | "zeta-sim-balanced"
  | "zeta-sim-high-risk";

export const COPILOT_MODE_OPTIONS: ReadonlyArray<{
  value: CopilotMode;
  label: string;
}> = [
  { value: "live", label: "Live" },
  { value: "zeta-sim-balanced", label: "Zeta Sim Balanced" },
  { value: "zeta-sim-high-risk", label: "Zeta Sim High Risk" },
];

const COPILOT_MODE_OVERRIDE_STORAGE_KEY = "copilot-mode-override";

function parseCopilotMode(raw: string | undefined): CopilotMode {
  if (raw === "zeta-sim-balanced" || raw === "zeta-sim-high-risk") {
    return raw;
  }
  return "live";
}

function getCopilotModeOverrideFromLocalStorage(): CopilotMode | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COPILOT_MODE_OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    return parseCopilotMode(raw);
  } catch {
    return null;
  }
}

/** Modo activo (lectura de `process.env.NEXT_PUBLIC_COPILOT_MODE`). */
export function getBaseCopilotMode(): CopilotMode {
  return parseCopilotMode(process.env.NEXT_PUBLIC_COPILOT_MODE);
}

/** Modo activo (env + override local en desarrollo). */
export function getCopilotMode(): CopilotMode {
  const override = getCopilotModeOverrideFromLocalStorage();
  if (override) {
    return override;
  }
  return getBaseCopilotMode();
}

/** True si el dashboard debe usar el lote Zeta simulado en lugar de Supabase. */
export function isZetaSimulationActive(mode: CopilotMode = getCopilotMode()): boolean {
  return mode !== "live";
}

/** Etiqueta corta para UI de diagnóstico (sin selector). */
export function getCopilotModeLabel(mode: CopilotMode): string {
  switch (mode) {
    case "zeta-sim-balanced":
      return "Simulación Zeta · equilibrado";
    case "zeta-sim-high-risk":
      return "Simulación Zeta · alto riesgo";
    case "live":
      return "Live";
  }
}

/**
 * Override local SOLO en desarrollo.
 * Persiste siempre el modo elegido en navegador (`live` incluido) para evitar
 * editar `.env.local` durante pruebas manuales.
 */
export function setLocalCopilotModeOverride(mode: CopilotMode): void {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COPILOT_MODE_OVERRIDE_STORAGE_KEY, mode);
  } catch {
    // No-op: si localStorage falla, se mantiene el modo por .env
  }
}
