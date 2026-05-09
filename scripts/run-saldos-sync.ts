/**
 * Script de sync directo de saldos pendientes para todos los clientes activos.
 * Uso: npx tsx --tsconfig tsconfig.json scripts/run-saldos-sync.ts [--limit N] [--workspace-id ID]
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { runZetaSaldosPendientesPipeline } from "../lib/integrations/zeta/zeta-saldos-pipeline";

const args = process.argv.slice(2);
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx >= 0 ? parseInt(args[idx + 1] ?? "183", 10) : 183;
})();
const WORKSPACE_ID = (() => {
  const idx = args.indexOf("--workspace-id");
  return idx >= 0 ? (args[idx + 1] ?? "") : "040321ff-10fd-4da3-aeca-f1865f879986";
})();
const PAGE_DELAY_MS = 300;
const CLIENT_DELAY_MS = 500;
const MAX_PAGES = 5;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.");
  process.exit(1);
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(JSON.stringify({ timestamp: new Date().toISOString(), source: "run_saldos_sync", kind: "start", workspace_id: WORKSPACE_ID, limit: LIMIT }));

  const { data: companies, error } = await sb.from("proto_companies")
    .select("id, Codigo, name")
    .eq("workspace_company_id", WORKSPACE_ID)
    .eq("is_active", true)
    .not("Codigo", "is", null)
    .limit(LIMIT);

  if (error) {
    console.error("DB error:", error.message);
    process.exit(1);
  }

  const eligible = (companies ?? []).filter((c) => String((c as { Codigo?: unknown }).Codigo ?? "").trim().length > 0) as { id: string; Codigo: string; name: string | null }[];

  console.error(`\nClientes elegibles con Codigo: ${eligible.length}\n`);

  let totalUpserted = 0;
  let okCount = 0;
  let errorCount = 0;

  for (let i = 0; i < eligible.length; i++) {
    const c = eligible[i]!;
    const codigo = String(c.Codigo).trim();
    if (i > 0) await new Promise((r) => setTimeout(r, CLIENT_DELAY_MS));

    try {
      const result = await runZetaSaldosPendientesPipeline(sb, WORKSPACE_ID, randomUUID(), {
        protoCompanyId: c.id,
        clienteCodigo: codigo,
        mode: "incremental",
        maxPagesPerRun: MAX_PAGES,
        pageDelayMs: PAGE_DELAY_MS,
      });
      totalUpserted += result.rows_upserted;
      const status = result.stopped_reason === "completed" ? "ok" : result.stopped_reason === "max_pages" ? "partial" : "error";
      if (status !== "error") okCount++; else errorCount++;
      console.error(`[${i + 1}/${eligible.length}] ${codigo.padStart(4)} ${String(c.name ?? "").slice(0, 40).padEnd(40)} → ${result.rows_upserted} upserted (${result.stopped_reason})`);
    } catch (e) {
      errorCount++;
      const msg = e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120);
      console.error(`[${i + 1}/${eligible.length}] ${codigo.padStart(4)} ERROR: ${msg}`);
    }
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    source: "run_saldos_sync",
    kind: "summary",
    workspace_id: WORKSPACE_ID,
    clients_processed: eligible.length,
    ok: okCount,
    errors: errorCount,
    total_upserted: totalUpserted,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
