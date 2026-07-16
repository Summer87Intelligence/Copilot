/**
 * Live read-only probe (Summer87): identity net = emitted − NC + migration flags.
 * Skips if .env.local / WORKSPACE_COMPANY_ID missing. No DML.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { buildSalesPeriodSnapshot } from "@/lib/sales/canonical/sales-aggregations";

function loadEnvLocal(): Record<string, string> {
  if (!fs.existsSync(".env.local")) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const env = loadEnvLocal();
const hasLive = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.WORKSPACE_COMPANY_ID);

describe.skipIf(!hasLive)("live FASE 9D sales consistency (Summer87)", () => {
  it("net identity holds for junio/julio and client assignment table is ready", async () => {
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const dataset = await loadSalesDataset(supabase, env.WORKSPACE_COMPANY_ID!, {
      minDate: "2026-01-01",
    });

    expect(dataset.meta.clientAssignmentMigrationPending).toBe(false);
    expect(dataset.meta.salespersonsMigrationPending).toBe(false);
    expect(dataset.salespersons.length).toBeGreaterThanOrEqual(3);

    for (const [from, to] of [
      ["2026-06-01", "2026-06-30"],
      ["2026-07-01", "2026-07-31"],
      ["2026-07-01", "2026-07-16"],
    ] as const) {
      const snap = buildSalesPeriodSnapshot(dataset.documents, from, to, {
        firstSaleByCustomerId: dataset.firstSaleByCustomerId,
      });
      expect(snap.netSalesByCurrency.UYU).toBeCloseTo(snap.salesEmitted.UYU - snap.creditNotes.UYU, 2);
      expect(snap.netSalesByCurrency.USD).toBeCloseTo(snap.salesEmitted.USD - snap.creditNotes.USD, 2);
    }

    // Sin asignaciones de cliente aún → histórico vacío (tabla lista, 0 filas).
    expect(dataset.clientAssignments.length).toBe(0);
  }, 120_000);
});
