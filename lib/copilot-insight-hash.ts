import type { CopilotInsight } from "@/lib/copilot-engine";

const SEP = "\u{001e}";

/**
 * Huella estable por insight + empresa + snapshot (uuid o vacío si mock).
 * Debe coincidir con la lógica de deduplicación en DB (`insight_hash` único).
 */
export async function computeCopilotInsightHash(
  companyId: string,
  snapshotId: string | null,
  insight: CopilotInsight
): Promise<string> {
  const payload = [
    companyId,
    snapshotId ?? "",
    insight.type,
    insight.title,
    insight.priority,
    insight.description,
  ].join(SEP);

  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}
