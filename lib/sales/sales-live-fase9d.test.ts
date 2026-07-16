/**
 * Live read-only probe (Summer87): identity net = emitted − NC + migration flags.
 * Skips if .env.local / WORKSPACE_COMPANY_ID missing. No DML.
 *
 * FASE 9E: el historial de asignación cliente↔comercial NO se asume vacío. Tras
 * validación real quedan filas históricas cerradas legítimas. El test tolera
 * historial previo y valida invariantes temporales (sin solapamientos, a lo sumo
 * una asignación abierta por cliente, valid_to >= valid_from), en vez de exigir 0 filas.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { buildSalesPeriodSnapshot } from "@/lib/sales/canonical/sales-aggregations";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";

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

    // Historial de asignación cliente↔comercial: tolera filas previas. Valida
    // invariantes temporales sin depender de que la tabla esté vacía.
    const assignments = dataset.clientAssignments;

    // 1) valid_to >= valid_from en toda fila cerrada; valid_from dentro de rango.
    for (const a of assignments) {
      expect(a.validFrom >= SALESPERSON_START_DATE).toBe(true);
      if (a.validTo !== null) {
        expect(a.validTo >= a.validFrom).toBe(true);
      }
    }

    // 2) A lo sumo UNA asignación abierta (valid_to = null) por cliente.
    const openByCustomer = new Map<string, number>();
    for (const a of assignments) {
      if (a.validTo !== null) continue;
      openByCustomer.set(a.customerId, (openByCustomer.get(a.customerId) ?? 0) + 1);
    }
    for (const [, count] of openByCustomer) {
      expect(count).toBeLessThanOrEqual(1);
    }

    // 3) Sin períodos solapados por cliente: ordenadas por valid_from, cada
    //    período arranca después de que cierra el anterior (una reasignación
    //    histórica no reescribe la anterior, la sucede).
    const byCustomer = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = byCustomer.get(a.customerId) ?? [];
      list.push(a);
      byCustomer.set(a.customerId, list);
    }
    for (const [, list] of byCustomer) {
      const sorted = [...list].sort((x, y) => (x.validFrom < y.validFrom ? -1 : x.validFrom > y.validFrom ? 1 : 0));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        const cur = sorted[i]!;
        // El anterior debe estar cerrado y cerrar antes de que abra el siguiente.
        expect(prev.validTo).not.toBeNull();
        if (prev.validTo !== null) {
          expect(prev.validTo <= cur.validFrom).toBe(true);
        }
      }
    }
  }, 120_000);
});
