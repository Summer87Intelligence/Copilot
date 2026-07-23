/**
 * FASE BANK-2026-CLEANUP — snapshot + dry-run + apply reversible.
 *
 *   node --env-file=.env.local --import tsx scripts/bank-2026-cleanup-apply.ts
 *   node --env-file=.env.local --import tsx scripts/bank-2026-cleanup-apply.ts --apply
 *
 * Sin --apply: solo reporta (.agents/qa-bank-2026-cleanup-dry-run.json).
 * Con --apply: exclusión 2025 + duplicados A/B. Nunca DELETE. Nunca C/D.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  BANK_EXCLUSION_REASON_BEFORE_2026,
  MIN_BANK_OPERATIONAL_DATE,
} from "@/lib/bank/canonical/historical-policy";
import { computeBankMovementFingerprintV1 } from "@/lib/bank-movements/bank-movement-fingerprint-v1";
import {
  classifyDedupeGroup,
  planSafeDuplicateMarks,
  type DedupeCandidateGroup,
} from "@/lib/bank-movements/bank-dedupe-safety";

const SCRIPT_VERSION = "bank-2026-cleanup-apply@2026-07-23";
const ACTOR = "bank-2026-cleanup-apply";

type MovementRow = {
  id: string;
  workspace_id: string;
  movement_date: string;
  amount: number | string;
  currency: string;
  direction: string;
  bank_reference: string | null;
  description: string;
  account_label: string | null;
  bank_name: string;
  created_at: string;
  import_id: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint_v1: string | null;
  excluded_from_operations: boolean | null;
  duplicate_of: string | null;
};

/** Client sin Database genérico (scripts operativos). */
type OpsClient = SupabaseClient;

function extractAccountNumber(accountLabel: string | null): string {
  return accountLabel?.match(/(\d{6,})/)?.[1] ?? "";
}

function fingerprintOf(row: MovementRow): string {
  if (row.fingerprint_v1 && row.fingerprint_v1.length > 0) return row.fingerprint_v1;
  return computeBankMovementFingerprintV1({
    workspaceId: row.workspace_id,
    accountNumber: extractAccountNumber(row.account_label),
    bankName: row.bank_name,
    bankReference: row.bank_reference,
    movementDate: row.movement_date,
    amount: Number(row.amount),
    currency: row.currency,
    direction: row.direction,
    description: row.description,
  }).fingerprint;
}

async function loadActiveClient(sb: OpsClient, movementId: string): Promise<string | null> {
  const { data } = await sb
    .from("bank_movement_client_identifications")
    .select("client_company_id, status")
    .eq("movement_id", movementId)
    .neq("status", "excluded")
    .neq("status", "revoked")
    .limit(1);
  const row = (data?.[0] ?? null) as { client_company_id?: string } | null;
  return row?.client_company_id ?? null;
}

async function loadAllMovements(sb: OpsClient): Promise<MovementRow[]> {
  const rows: MovementRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await sb
      .from("bank_movements")
      .select(
        "id, workspace_id, movement_date, amount, currency, direction, bank_reference, description, account_label, bank_name, created_at, import_id, status, metadata, fingerprint_v1, excluded_from_operations, duplicate_of"
      )
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const batch = (data ?? []) as MovementRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const apply = process.argv.includes("--apply");
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } }) as OpsClient;
  const stamp = new Date().toISOString();
  const rows = await loadAllMovements(sb);

  const physical = rows.length;
  const operational = rows.filter((r) => !r.excluded_from_operations && !r.duplicate_of).length;
  const beforeCutoff = rows.filter((r) => r.movement_date.slice(0, 10) < MIN_BANK_OPERATIONAL_DATE);
  const exclude2025Targets = beforeCutoff.filter((r) => !r.excluded_from_operations);

  const byYear: Record<string, number> = {};
  const byMonthDir: Record<string, { n: number; sum: number }> = {};
  for (const r of rows) {
    const y = r.movement_date.slice(0, 4);
    byYear[y] = (byYear[y] ?? 0) + 1;
    if (!r.excluded_from_operations && !r.duplicate_of) {
      const key = `${r.movement_date.slice(0, 7)}|${r.currency}|${r.direction}`;
      const slot = byMonthDir[key] ?? { n: 0, sum: 0 };
      slot.n += 1;
      slot.sum += Number(r.amount);
      byMonthDir[key] = slot;
    }
  }

  const [
    { count: assocActive },
    { count: assocRevoked },
    { count: linksCount },
    { count: allocationsCount },
    { count: eventsCount },
    { count: importBatchesCount },
  ] = await Promise.all([
    sb
      .from("bank_movement_client_identifications")
      .select("*", { count: "exact", head: true })
      .not("status", "in", "(revoked,excluded)"),
    sb
      .from("bank_movement_client_identifications")
      .select("*", { count: "exact", head: true })
      .in("status", ["revoked", "excluded"]),
    sb.from("bank_movement_reconciliation_links").select("*", { count: "exact", head: true }),
    sb.from("payment_allocations").select("*", { count: "exact", head: true }),
    sb.from("reconciliation_events").select("*", { count: "exact", head: true }),
    sb.from("bank_statement_imports").select("*", { count: "exact", head: true }),
  ]);
  const links = linksCount ?? 0;
  const allocations = allocationsCount ?? 0;
  const events = eventsCount ?? 0;
  const importBatches = importBatchesCount ?? 0;

  const byFp = new Map<string, MovementRow[]>();
  for (const row of rows) {
    const fp = fingerprintOf(row);
    const list = byFp.get(fp) ?? [];
    list.push(row);
    byFp.set(fp, list);
  }

  const candidateGroups: DedupeCandidateGroup[] = [];
  const groupDetails: Array<{
    fingerprint: string;
    class: string;
    canonical_id: string;
    duplicate_ids: string[];
    active_members: number;
  }> = [];

  for (const [fingerprint, members] of byFp) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const active = sorted.filter((m) => !m.excluded_from_operations && !m.duplicate_of);
    if (active.length < 2) continue;

    const canonical = active[0]!;
    const duplicates = active.slice(1).map((m) => m.id);
    const refs = new Set(
      active
        .map((m) => (m.bank_reference ?? "").trim().toUpperCase().replace(/\s+/g, ""))
        .filter(Boolean)
    );
    const parsers = new Set(
      active.map((m) => String((m.metadata ?? {}).parser ?? (m.metadata ?? {}).source_parser ?? ""))
    );
    const clients = new Set<string>();
    for (const m of active) {
      const c = await loadActiveClient(sb, m.id);
      if (c) clients.add(c);
    }

    const group: DedupeCandidateGroup = {
      fingerprint,
      canonicalMovementId: canonical.id,
      duplicateMovementIds: duplicates,
      sameSource: parsers.size <= 1,
      hasConflictingAssociations: clients.size > 1,
      exactFieldMatch: refs.size <= 1,
      crossParser: parsers.size > 1,
    };
    candidateGroups.push(group);
    groupDetails.push({
      fingerprint,
      class: classifyDedupeGroup(group),
      canonical_id: canonical.id,
      duplicate_ids: duplicates,
      active_members: active.length,
    });
  }

  const planned = planSafeDuplicateMarks(candidateGroups);
  const classCounts = { A: 0, B: 0, C: 0, D: 0 };
  for (const g of groupDetails) {
    if (g.class === "A_exact_safe") classCounts.A += 1;
    else if (g.class === "B_cross_parser_safe") classCounts.B += 1;
    else if (g.class === "C_ambiguous") classCounts.C += 1;
    else classCounts.D += 1;
  }

  const snapshot = {
    generated_at: stamp,
    script_version: SCRIPT_VERSION,
    actor: ACTOR,
    apply,
    min_bank_operational_date: MIN_BANK_OPERATIONAL_DATE,
    exclusion_reason: BANK_EXCLUSION_REASON_BEFORE_2026,
    counts: {
      physical_total: physical,
      operational_total: operational,
      before_2026_total: beforeCutoff.length,
      before_2026_need_exclude: exclude2025Targets.length,
      by_year: byYear,
      duplicates_already_marked: rows.filter((r) => Boolean(r.duplicate_of)).length,
      associations_active: assocActive ?? 0,
      associations_revoked: assocRevoked ?? 0,
      links,
      allocations,
      events,
      import_batches: importBatches,
    },
    operational_by_month_currency_direction: byMonthDir,
    dedupe: {
      multi_active_groups: groupDetails.length,
      class_counts: classCounts,
      planned_marks: planned.apply.length,
      skipped_groups: planned.skipped.length,
      groups: groupDetails,
    },
    exclude_2025_sample: exclude2025Targets.slice(0, 50).map((r) => ({
      id: r.id,
      movement_date: r.movement_date,
      amount: Number(r.amount),
      currency: r.currency,
      direction: r.direction,
      description: r.description.slice(0, 80),
      import_id: r.import_id,
      duplicate_of: r.duplicate_of,
      status: r.status,
    })),
    report_hash: createHash("sha256")
      .update(
        JSON.stringify({
          exclude2025Targets: exclude2025Targets.map((r) => r.id),
          planned: planned.apply,
        })
      )
      .digest("hex")
      .slice(0, 16),
  };

  mkdirSync(".agents", { recursive: true });
  const dryPath = ".agents/qa-bank-2026-cleanup-dry-run.json";
  writeFileSync(dryPath, JSON.stringify(snapshot, null, 2));
  console.log(
    JSON.stringify(
      {
        dry_run: dryPath,
        counts: snapshot.counts,
        dedupe: snapshot.dedupe.class_counts,
        planned_marks: planned.apply.length,
        exclude_2025: exclude2025Targets.length,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to mark 2025 + A/B (reversible).");
    return;
  }

  let excluded2025 = 0;
  let markedDup = 0;
  let skippedConflict = 0;

  for (const row of exclude2025Targets) {
    const meta = {
      ...(row.metadata ?? {}),
      exclusion_reason: BANK_EXCLUSION_REASON_BEFORE_2026,
      excluded_at: stamp,
      excluded_by: ACTOR,
      script_version: SCRIPT_VERSION,
    };
    const { error: updErr } = await sb
      .from("bank_movements")
      .update({
        excluded_from_operations: true,
        metadata: meta,
      })
      .eq("id", row.id);
    if (!updErr) excluded2025 += 1;
  }

  for (const mark of planned.apply) {
    const copyClient = await loadActiveClient(sb, mark.movementId);
    const canonClient = await loadActiveClient(sb, mark.canonicalMovementId);
    if (copyClient && canonClient && copyClient !== canonClient) {
      skippedConflict += 1;
      continue;
    }
    const row = rows.find((r) => r.id === mark.movementId);
    const meta = {
      ...(row?.metadata ?? {}),
      duplicate_status: "duplicate_of_import",
      duplicate_of: mark.canonicalMovementId,
      exclusion_reason: mark.exclusion_reason,
      duplicate_reason: mark.safetyClass,
      detected_at: stamp,
      excluded_by: ACTOR,
      script_version: SCRIPT_VERSION,
    };
    const { error: updErr } = await sb
      .from("bank_movements")
      .update({
        metadata: meta,
        duplicate_of: mark.canonicalMovementId,
        excluded_from_operations: true,
      })
      .eq("id", mark.movementId);
    if (!updErr) markedDup += 1;
  }

  const applyReport = {
    generated_at: stamp,
    script_version: SCRIPT_VERSION,
    actor: ACTOR,
    excluded_2025: excluded2025,
    marked_duplicates_ab: markedDup,
    skipped_conflict: skippedConflict,
    physical_unchanged_expected: true,
  };
  writeFileSync(".agents/qa-bank-2026-cleanup-apply.json", JSON.stringify(applyReport, null, 2));
  console.log(JSON.stringify(applyReport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
