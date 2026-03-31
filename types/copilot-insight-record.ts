import type { CopilotInsight } from "@/lib/copilot-engine";

/**
 * Fila de `public.copilot_insights` mapeada al dominio (camelCase).
 */
export type CopilotInsightRecord = {
  id: string;
  companyId: string;
  snapshotId: string | null;
  type: CopilotInsight["type"];
  title: string;
  description: string;
  priority: CopilotInsight["priority"];
  createdAt: string;
};
