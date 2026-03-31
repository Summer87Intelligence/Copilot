import { supabase } from "@/lib/supabase-client";
import type { CopilotInsight } from "@/lib/copilot-engine";
import type { CopilotInsightRecord } from "@/types/copilot-insight-record";

const DEFAULT_LIMIT = 10;

type CopilotInsightRow = {
  id: string;
  company_id: string;
  snapshot_id: string | null;
  type: string;
  title: string;
  description: string;
  priority: string;
  created_at: string;
};

function isInsightType(v: string): v is CopilotInsight["type"] {
  return v === "alert" || v === "opportunity" || v === "recommendation";
}

function isPriority(v: string): v is CopilotInsight["priority"] {
  return v === "high" || v === "medium" || v === "low";
}

function mapRow(row: CopilotInsightRow): CopilotInsightRecord | null {
  if (!isInsightType(row.type) || !isPriority(row.priority)) {
    return null;
  }
  return {
    id: row.id,
    companyId: row.company_id,
    snapshotId: row.snapshot_id,
    type: row.type,
    title: row.title,
    description: row.description,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

/**
 * Últimos insights persistidos para la empresa (más recientes primero).
 */
export async function getRecentCopilotInsights(
  companyId: string,
  limit: number = DEFAULT_LIMIT
): Promise<CopilotInsightRecord[]> {
  const cap = Math.min(Math.max(1, limit), 50);

  const { data, error } = await supabase
    .from("copilot_insights")
    .select(
      "id, company_id, snapshot_id, type, title, description, priority, created_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error || !data) {
    if (error) {
      console.warn("[copilot-insights-read]", error.message);
    }
    return [];
  }

  return (data as CopilotInsightRow[])
    .map(mapRow)
    .filter((r): r is CopilotInsightRecord => r != null);
}
