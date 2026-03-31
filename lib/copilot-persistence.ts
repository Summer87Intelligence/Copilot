import { generateCopilotInsights } from "@/lib/copilot-engine";
import type { CopilotInsight } from "@/lib/copilot-engine";
import type { DashboardSnapshotRecord } from "@/types/dashboard-source";
import { saveCopilotInsights } from "@/services/copilot-insights-source";

export type PersistCopilotInsightsResult = {
  /** true si Supabase respondió sin error (incluye “todo duplicado” con upsert ignore) */
  saved: boolean;
  error: Error | null;
};

/**
 * Persistencia opcional de insights del Copilot: no lanza; fallos solo se reflejan
 * en el retorno y en `console.warn` para no romper el dashboard.
 *
 * La capa `saveCopilotInsights` usa **`insight_hash`** (SHA-256 estable) + **upsert**
 * con `ignoreDuplicates: true` → re-ejecutar con los mismos datos no duplica filas
 * (tras migración `extend-copilot-insights-idempotency.sql`).
 *
 * ---
 * **Dónde integrar (no en cada render del dashboard):**
 *
 * - **Route Handler** / **Server Action** tras `getDashboardSnapshotRecordByScenario`
 *   y opcionalmente `generateCopilotInsights` con snapshot anterior en servidor.
 * - **Job/cron** al cerrar período o al importar snapshot.
 * - **Botón explícito** (“Guardar análisis”) que dispare una sola llamada.
 * - **No** en `useEffect` del cliente ligado a `scenario`/render: aunque el upsert
 *   sea idempotente, seguiría generando tráfico innecesario y acopla auth anónimo
 *   al ciclo de vida de la página.
 *
 * ---
 * @example Flujo recomendado (servidor):
 * ```ts
 * const record = await getDashboardSnapshotRecordByScenario("risk");
 * const ctx = await getCurrentAppUserContext(); // o sesión en servidor
 * await persistCopilotInsightsForSnapshotRecord(record, ctx?.companyId ?? null);
 * ```
 */
export async function persistCopilotInsightsIfPossible(
  companyId: string | null,
  snapshotId: string | null,
  insights: CopilotInsight[]
): Promise<PersistCopilotInsightsResult> {
  if (!companyId || insights.length === 0) {
    return { saved: false, error: null };
  }

  try {
    const { error } = await saveCopilotInsights(
      snapshotId,
      companyId,
      insights
    );
    if (error) {
      console.warn("[copilot-persistence]", error.message);
      return { saved: false, error };
    }
    return { saved: true, error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.warn("[copilot-persistence]", err.message);
    return { saved: false, error: err };
  }
}

/**
 * Genera insights desde el snapshot del registro y persiste con `record.id` real
 * cuando existe (vincula `copilot_insights.snapshot_id`).
 *
 * **No** está cableado al dashboard: llamar solo desde servidor / acción explícita.
 * Si `record.id` es null (mock), igual persiste con `snapshot_id` null; el hash
 * sigue deduplicando por contenido + empresa.
 */
export async function persistCopilotInsightsForSnapshotRecord(
  record: DashboardSnapshotRecord,
  companyId: string | null
): Promise<PersistCopilotInsightsResult> {
  const insights = generateCopilotInsights(record.snapshot);
  return persistCopilotInsightsIfPossible(companyId, record.id, insights);
}
