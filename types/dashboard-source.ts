import type { DashboardSnapshot } from "@/lib/dashboard-data";

/**
 * Snapshot de negocio listo para el dominio + referencia a la fila en Supabase
 * (cuando existe). `id` es null si se usa fallback/mock o falló la lectura.
 */
export type DashboardSnapshotRecord = {
  id: string | null;
  snapshot: DashboardSnapshot;
};
