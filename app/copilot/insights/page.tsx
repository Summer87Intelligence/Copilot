import { generateInsights } from "@/lib/copilot-insight-engine";

import { CopilotInsightsClient } from "./insights-client";

export default async function CopilotInsightsPage() {
  const insights = await generateInsights();

  return <CopilotInsightsClient insights={insights} />;
}
