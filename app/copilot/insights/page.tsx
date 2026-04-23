import { cookies, headers } from "next/headers";

import {
  generateInsightsFromBatch,
  type InsightEngineProtoBatch,
} from "@/lib/copilot-insight-engine";

import { CopilotInsightsClient } from "./insights-client";

async function fetchInsightEngineBatch(): Promise<InsightEngineProtoBatch> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  if (!host) {
    return { invoices: [], payments: [], companies: [] };
  }
  const forwardedProto = hdrs.get("x-forwarded-proto");
  const protocol =
    forwardedProto ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const base = `${protocol}://${host}`;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await fetch(`${base}/api/copilot/insight-engine-dataset`, {
    method: "GET",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    return { invoices: [], payments: [], companies: [] };
  }

  const json = (await res.json()) as {
    ok?: boolean;
    data?: InsightEngineProtoBatch;
  };

  if (!json.ok || !json.data) {
    return { invoices: [], payments: [], companies: [] };
  }

  return json.data;
}

export default async function CopilotInsightsPage() {
  const batch = await fetchInsightEngineBatch();
  const insights = await generateInsightsFromBatch(batch);

  return <CopilotInsightsClient insights={insights} />;
}
