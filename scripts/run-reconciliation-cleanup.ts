/**
 * Orphan pending invoice reconciliation — one-shot cleanup run.
 *
 * Runs syncMode="reconciliation_cleanup" (forces bootstrap + orphan detection)
 * for all active clients with a Zeta Codigo. After a full sync, any pending
 * invoice NOT returned by Zeta is flagged. 3rd consecutive miss → auto-close.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/run-reconciliation-cleanup.ts [--limit N] [--dry-run]
 *
 * Flags:
 *   --limit N        Process only first N clients (default: all)
 *   --dry-run        Log intent but skip actual pipeline calls
 *   --workspace-id X Override workspace UUID
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { runZetaSaldosPendientesPipeline } from "../lib/integrations/zeta/zeta-saldos-pipeline";

const args = process.argv.slice(2);
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx >= 0 ? parseInt(args[idx + 1] ?? "9999", 10) : 9999;
})();
const DRY_RUN = args.includes("--dry-run");
const WORKSPACE_ID = (() => {
  const idx = args.indexOf("--workspace-id");
  return idx >= 0 ? (args[idx + 1] ?? "") : "040321ff-10fd-4da3-aeca-f1865f879986";
})();

const PAGE_DELAY_MS = 400;
const CLIENT_DELAY_MS = 600;
const MAX_PAGES = 99; // need full data for reconciliation — no page cap

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.");
  process.exit(1);
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    source: "reconciliation_cleanup",
    kind: "start",
    workspace_id: WORKSPACE_ID,
    limit: LIMIT,
    dry_run: DRY_RUN,
  }));

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

  const eligible = (companies ?? []).filter(
    (c) => String((c as { Codigo?: unknown }).Codigo ?? "").trim().length > 0
  ) as { id: string; Codigo: string; name: string | null }[];

  console.error(`\nClientes con Codigo: ${eligible.length}${DRY_RUN ? " [DRY RUN]" : ""}\n`);

  let okCount = 0;
  let errorCount = 0;
  let partialCount = 0;

  // Aggregate reconciliation metrics
  let totalChecked = 0;
  let totalOrphansDetected = 0;
  let totalWarnings = 0;
  let totalAutoClosed = 0;
  let totalDbErrors = 0;

  const autoClosedClients: Array<{ name: string | null; codigo: string; count: number }> = [];
  const warnClients: Array<{ name: string | null; codigo: string; count: number }> = [];

  for (let i = 0; i < eligible.length; i++) {
    const c = eligible[i]!;
    const codigo = String(c.Codigo).trim();
    if (i > 0) await new Promise((r) => setTimeout(r, CLIENT_DELAY_MS));

    if (DRY_RUN) {
      console.error(`[${i + 1}/${eligible.length}] ${codigo.padStart(4)} ${String(c.name ?? "").slice(0, 40).padEnd(40)} [skip — dry-run]`);
      okCount++;
      continue;
    }

    try {
      const result = await runZetaSaldosPendientesPipeline(sb, WORKSPACE_ID, randomUUID(), {
        protoCompanyId: c.id,
        clienteCodigo: codigo,
        mode: "bootstrap",
        syncMode: "reconciliation_cleanup",
        maxPagesPerRun: MAX_PAGES,
        pageDelayMs: PAGE_DELAY_MS,
      });

      const rec = result.reconciliation;
      const status =
        result.stopped_reason === "completed" ? "ok"
          : result.stopped_reason === "max_pages" ? "partial"
          : "error";

      if (status === "ok") okCount++;
      else if (status === "partial") { partialCount++; }
      else errorCount++;

      if (rec) {
        totalChecked += rec.pending_invoices_checked;
        totalOrphansDetected += rec.orphans_detected;
        totalWarnings += rec.warnings;
        totalAutoClosed += rec.auto_closed;
        totalDbErrors += rec.db_errors;

        if (rec.auto_closed > 0) {
          autoClosedClients.push({ name: c.name, codigo, count: rec.auto_closed });
        }
        if (rec.warnings > 0) {
          warnClients.push({ name: c.name, codigo, count: rec.warnings });
        }
      }

      const recSummary = rec
        ? `checked=${rec.pending_invoices_checked} orphans=${rec.orphans_detected} warn=${rec.warnings} closed=${rec.auto_closed}`
        : "no-rec";

      console.error(
        `[${i + 1}/${eligible.length}] ${codigo.padStart(4)} ${String(c.name ?? "").slice(0, 36).padEnd(36)} → ${result.stopped_reason} | ${recSummary}`
      );
    } catch (e) {
      errorCount++;
      const msg = e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120);
      console.error(`[${i + 1}/${eligible.length}] ${codigo.padStart(4)} ERROR: ${msg}`);
    }
  }

  console.error("\n--- RECONCILIATION SUMMARY ---");
  console.error(`Clients: ${eligible.length} ok=${okCount} partial=${partialCount} error=${errorCount}`);
  console.error(`Invoices checked: ${totalChecked}`);
  console.error(`Orphans detected: ${totalOrphansDetected}`);
  console.error(`Warnings (1st/2nd miss): ${totalWarnings}`);
  console.error(`Auto-closed (3rd miss): ${totalAutoClosed}`);
  console.error(`DB errors: ${totalDbErrors}`);

  if (autoClosedClients.length > 0) {
    console.error("\nAuto-closed per client:");
    for (const c of autoClosedClients) {
      console.error(`  ${c.codigo.padStart(4)} ${String(c.name ?? "").slice(0, 40).padEnd(40)} closed=${c.count}`);
    }
  }
  if (warnClients.length > 0) {
    console.error("\nWarned per client (miss 1 or 2):");
    for (const c of warnClients) {
      console.error(`  ${c.codigo.padStart(4)} ${String(c.name ?? "").slice(0, 40).padEnd(40)} warnings=${c.count}`);
    }
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    source: "reconciliation_cleanup",
    kind: "summary",
    workspace_id: WORKSPACE_ID,
    dry_run: DRY_RUN,
    clients_processed: eligible.length,
    ok: okCount,
    partial: partialCount,
    errors: errorCount,
    reconciliation: {
      pending_invoices_checked: totalChecked,
      orphans_detected: totalOrphansDetected,
      warnings: totalWarnings,
      auto_closed: totalAutoClosed,
      db_errors: totalDbErrors,
    },
    auto_closed_clients: autoClosedClients,
    warned_clients: warnClients,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
