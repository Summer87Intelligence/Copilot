import { computeCopilotInsightHash } from "@/lib/copilot-insight-hash";
import type { CopilotInsight } from "@/lib/copilot-engine";
import { supabase } from "@/lib/supabase-client";

type CopilotInsightRow = {
  company_id: string;
  snapshot_id: string | null;
  insight_hash: string;
  type: CopilotInsight["type"];
  title: string;
  description: string;
  priority: CopilotInsight["priority"];
};

/**
 * Persiste en bloque los insights del Copilot para una empresa y, opcionalmente,
 * el snapshot de origen. Usa `insight_hash` + upsert con `ignoreDuplicates` para
 * idempotencia. Requiere migración `extend-copilot-insights-idempotency.sql`.
 * Cliente público (anon); ajustar RLS/políticas en producción.
 */
export async function saveCopilotInsights(
  snapshotId: string | null,
  companyId: string,
  insights: CopilotInsight[]
): Promise<{ error: Error | null }> {
  if (insights.length === 0) {
    return { error: null };
  }

  const rows: CopilotInsightRow[] = await Promise.all(
    insights.map(async (insight) => ({
      company_id: companyId,
      snapshot_id: snapshotId,
      insight_hash: await computeCopilotInsightHash(
        companyId,
        snapshotId,
        insight
      ),
      type: insight.type,
      title: insight.title,
      description: insight.description,
      priority: insight.priority,
    }))
  );

  const { error } = await supabase.from("copilot_insights").upsert(rows, {
    onConflict: "insight_hash",
    ignoreDuplicates: true,
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}
