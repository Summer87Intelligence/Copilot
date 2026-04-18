import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type { CopilotInsight } from "@/lib/copilot-engine";

type CopilotInsightUpsertRow = {
  company_id: string;
  snapshot_id: string | null;
  insight_hash: string;
  type: CopilotInsight["type"];
  title: string;
  description: string;
  priority: CopilotInsight["priority"];
};

/**
 * Insights persistidos más recientes para una empresa (tenant SaaS = `company_id`).
 */
export async function selectRecentCopilotInsightsByCompany(
  client: OperationalSupabase,
  companyId: string,
  limit: number
) {
  return client
    .from("copilot_insights")
    .select(
      "id, company_id, snapshot_id, type, title, description, priority, created_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function upsertCopilotInsightRows(
  client: OperationalSupabase,
  rows: CopilotInsightUpsertRow[]
) {
  return client.from("copilot_insights").upsert(rows, {
    onConflict: "insight_hash",
    ignoreDuplicates: true,
  });
}
