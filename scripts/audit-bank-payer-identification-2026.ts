#!/usr/bin/env node
/**
 * FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001 — auditoría read-only de
 * identidades de pagador en movimientos de ingreso Santander.
 *
 * Agrupa movimientos por nombre de pagador normalizado (nunca por referencia
 * puntual TT/LR/TR/LE/NRR ni por importe/fecha), los cruza contra clientes
 * reales y recibos existentes, y clasifica evidencia. 100% solo lectura: no
 * escribe, no crea recibos, no modifica facturas, no confirma nada.
 *
 * Uso:
 *   npx tsx scripts/audit-bank-payer-identification-2026.ts [--from 2026-01-01] [--to 2026-07-20] [--json out.json]
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  classifyEvidence,
  clusterInflowMovements,
  deriveIdentificationLevel,
  matchClusterToClients,
  type ClientCandidate,
  type ClusterableMovement,
} from "@/lib/bank/canonical/bank-payer-identification";
import { maskAccountOrReference } from "@/lib/bank/canonical/payer-identity";

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1]! : fallback;
}
const FROM = getArg("--from", "2026-01-01");
const TO = getArg("--to", "2026-07-20");
const JSON_OUT = getArg("--json", "");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceKey) {
  console.error("[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

type MovementRow = {
  id: string;
  workspace_id: string;
  movement_date: string;
  amount: string | number;
  currency: string;
  description: string | null;
  bank_reference: string | null;
  bank_name: string | null;
};

async function main(): Promise<void> {
  const { data: movementRows, error: movErr } = await sb
    .from("bank_movements")
    .select("id, workspace_id, movement_date, amount, currency, description, bank_reference, bank_name")
    .eq("direction", "inflow")
    .neq("status", "ignored")
    .gte("movement_date", FROM)
    .lte("movement_date", TO)
    .limit(5000);
  if (movErr) throw new Error(`bank_movements: ${movErr.message}`);

  const rows = (movementRows ?? []) as MovementRow[];
  const workspaceIds = Array.from(new Set(rows.map((r) => r.workspace_id)));

  const { data: companyRows, error: compErr } = await sb
    .from("proto_companies")
    .select("id, name, workspace_company_id")
    .in("workspace_company_id", workspaceIds)
    .limit(5000);
  if (compErr) throw new Error(`proto_companies: ${compErr.message}`);

  const { data: receiptRows, error: recErr } = await sb
    .from("proto_receipts")
    .select("id, company_id, amount, currency_code, currency, receipt_date, status, workspace_company_id")
    .in("workspace_company_id", workspaceIds)
    .limit(20000);
  if (recErr) throw new Error(`proto_receipts: ${recErr.message}`);

  const { data: linkRows, error: linkErr } = await sb
    .from("bank_movement_reconciliation_links")
    .select("bank_movement_id, target_type, target_id, archived_at, workspace_id")
    .in("workspace_id", workspaceIds)
    .is("archived_at", null)
    .limit(20000);
  if (linkErr) throw new Error(`bank_movement_reconciliation_links: ${linkErr.message}`);

  const linkedMovementIds = new Set((linkRows ?? []).map((l) => l.bank_movement_id as string));

  const clusterable: ClusterableMovement[] = rows.map((r) => ({
    movementId: r.id,
    movementDate: r.movement_date,
    amount: Number(r.amount),
    currency: r.currency,
    description: r.description,
    bankReference: r.bank_reference,
    bankName: r.bank_name,
  }));

  const clusters = clusterInflowMovements(clusterable);
  const noSignal = clusterable.length - clusters.reduce((n, c) => n + c.movements.length, 0);

  const clients: ClientCandidate[] = (companyRows ?? []).map((c) => ({
    clientCompanyId: c.id as string,
    clientName: c.name as string,
  }));

  const receiptsByClient = new Map<string, { amount: number; currency: string }[]>();
  for (const r of receiptRows ?? []) {
    const cid = r.company_id as string;
    const list = receiptsByClient.get(cid) ?? [];
    list.push({ amount: Number(r.amount), currency: (r.currency_code || r.currency) as string });
    receiptsByClient.set(cid, list);
  }

  console.log("═══ Auditoría de identificación de pagadores (read-only) ═══");
  console.log(`Ventana: ${FROM} .. ${TO}`);
  console.log(`Ingresos activos analizados: ${rows.length}`);
  console.log(`Sin señal de nombre extraíble (no agrupan): ${noSignal}`);
  console.log(`Identidades de pagador detectadas (clusters): ${clusters.length}`);
  console.log("");

  const report = clusters.map((cluster) => {
    const clientMatches = matchClusterToClients(cluster, clients);
    const distinctClientIds = Array.from(new Set(clientMatches.map((m) => m.clientCompanyId)));
    const hasCorroboratingReceipt = distinctClientIds.some((cid) =>
      (receiptsByClient.get(cid) ?? []).some((r) => cluster.currencies.includes(r.currency))
    );
    const evidence = classifyEvidence({ cluster, clientMatches, hasCorroboratingReceipt });

    const perMovement = cluster.movements.map((m) => {
      const hasFinancialLink = linkedMovementIds.has(m.movementId);
      const hasCompatibleReceipt = distinctClientIds.some((cid) =>
        (receiptsByClient.get(cid) ?? []).some(
          (r) => r.currency === m.currency && Math.abs(r.amount - m.amount) <= 0.01
        )
      );
      const level = deriveIdentificationLevel({
        clientConfirmed: distinctClientIds.length === 1 && evidence !== "ambiguous" && evidence !== "none",
        hasCompatibleReceipt,
        hasFinancialLink,
        hasInvoiceAllocations: false,
      });
      return {
        movementId: m.movementId,
        date: m.movementDate,
        amount: m.amount,
        currency: m.currency,
        referenceMasked: maskAccountOrReference(m.bankReference),
        hasCompatibleReceipt,
        hasFinancialLink,
        level,
      };
    });

    return {
      displayName: cluster.displayName,
      clusterKey: cluster.clusterKey,
      months: cluster.months,
      currencies: cluster.currencies,
      totalByCurrency: cluster.totalByCurrency,
      movementCount: cluster.movements.length,
      clientMatches,
      evidence,
      missingReceiptCount: perMovement.filter((m) => !m.hasCompatibleReceipt).length,
      compatibleReceiptCount: perMovement.filter((m) => m.hasCompatibleReceipt).length,
      alreadyLinkedCount: perMovement.filter((m) => m.hasFinancialLink).length,
      perMovement,
    };
  });

  const byEvidence = { strong: 0, probable: 0, ambiguous: 0, none: 0 };
  for (const r of report) byEvidence[r.evidence]++;
  console.log(
    `Evidencia: fuerte=${byEvidence.strong} probable=${byEvidence.probable} ambigua=${byEvidence.ambiguous} sin_candidato=${byEvidence.none}`
  );
  console.log("");

  const sorted = [...report].sort((a, b) => b.movementCount - a.movementCount);
  for (const r of sorted) {
    const clientLabel =
      r.clientMatches.length === 0
        ? "(sin candidato)"
        : r.clientMatches.length === 1
          ? r.clientMatches[0]!.clientName
          : `AMBIGUO: ${r.clientMatches.map((m) => m.clientName).join(" / ")}`;
    console.log(
      `${r.displayName} — ${r.movementCount} mov. [${r.months.join(",")}] ${JSON.stringify(r.totalByCurrency)} — evidencia=${r.evidence} — cliente=${clientLabel} — con_recibo=${r.compatibleReceiptCount} sin_recibo=${r.missingReceiptCount} ya_vinculados=${r.alreadyLinkedCount}`
    );
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ from: FROM, to: TO, totalMovements: rows.length, noSignal, report }, null, 2));
    console.log("");
    console.log(`Reporte completo guardado en: ${JSON_OUT}`);
  }
}

main().catch((err) => {
  console.error("[ERROR]", err instanceof Error ? err.message : err);
  process.exit(1);
});
