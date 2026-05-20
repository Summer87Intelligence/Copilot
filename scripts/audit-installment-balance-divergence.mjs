#!/usr/bin/env node
/**
 * ZETA-08 Audit — divergencia balance_amount (invoice) vs Σ cuota_saldo (installments).
 *
 * Detecta facturas donde:
 *   proto_invoices.balance_amount = 0
 *   PERO Σ proto_invoice_installments.cuota_saldo > 0
 *
 * Para cada factura diagnostica:
 *   - invoice_id, invoice_number, status, balance_amount
 *   - Σ cuota_saldo, cuotas abiertas
 *   - zeta_registro_id (de cuotas)
 *   - zeta_metadata.zeta_reconciliation state (evidence de quién cerró)
 *   - formato de invoice_number (CCV1 / legacy / otro)
 *   - source consistency (registro_id en invoice vs cuotas)
 *   - sospecha de causa raíz
 *
 * Causa raíz candidates:
 *   zero_pass         → zeroCcV1BalancesWithoutSaldoRow (solo CCV1, ausente en saldos)
 *   orphan_auto_close → reconcileMissingPendingInvoices (7+ misses)
 *   saldos_stale      → saldos no corrieron / cuotas se actualizaron después
 *   installment_stale → cuotas históricas de ciclos anteriores ya pagadas
 *   rounding          → delta < 1 UYU/USD
 *   zeta_inconsistent → Zeta reporta saldo 0 pero cuotas tienen saldo
 *   unknown           → sin evidencia concluyente
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/audit-installment-balance-divergence.mjs
 *   node --env-file=.env.local --import tsx scripts/audit-installment-balance-divergence.mjs --workspace <UUID>
 *   node --env-file=.env.local --import tsx scripts/audit-installment-balance-divergence.mjs --min-delta 0.01
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Env + args
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const MIN_DELTA = parseFloat(argFlag("--min-delta") ?? "0.005");

if (!url || !key || !workspaceId) {
  console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) { return Math.round(n * 100) / 100; }

async function fetchAll(label, buildQuery) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// zeta_reconciliation helpers
// ---------------------------------------------------------------------------

function readReconciliation(zetaMeta) {
  if (!zetaMeta || typeof zetaMeta !== "object") return null;
  const rec = zetaMeta.zeta_reconciliation;
  if (!rec || typeof rec !== "object") return null;
  return {
    pending_sync_missing_count: safeNum(rec.pending_sync_missing_count),
    last_seen_in_zeta_at: rec.last_seen_in_zeta_at ?? null,
    last_missing_detected_at: rec.last_missing_detected_at ?? null,
    resolved_at: rec.resolved_at ?? null,
    resolved_reason: rec.resolved_reason ?? null,
  };
}

function readRegistroId(zetaMeta) {
  if (!zetaMeta || typeof zetaMeta !== "object") return null;
  const id = zetaMeta?.zeta_comprobante_identity_v1?.registro_id;
  if (id) return String(id).trim();
  const v1 = zetaMeta?.zeta_customer_voucher_v1;
  if (v1?.zeta_registro_id) return String(v1.zeta_registro_id).trim();
  if (v1?.raw_payload?.RegistroId) return String(v1.raw_payload.RegistroId).trim();
  if (v1?.raw_payload?.registroId) return String(v1.raw_payload.registroId).trim();
  return null;
}

function invoiceFormat(invoiceNumber) {
  if (!invoiceNumber) return "unknown";
  if (invoiceNumber.startsWith("ZETA:CCV1:")) return "ccv1";
  if (invoiceNumber.startsWith("ZETA:")) return "legacy";
  return "other";
}

// ---------------------------------------------------------------------------
// Cause classification
// ---------------------------------------------------------------------------

/**
 * Classifies the most likely root cause of the divergence.
 *
 * Priority:
 *  1. rounding          — delta < 1 (negligible)
 *  2. orphan_auto_close — resolved_reason = AUTO_CLOSED or missing_count >= 7
 *  3. zero_pass         — CCV1 + last_seen_in_zeta_at set + not auto-closed
 *  4. saldos_stale      — last_seen_in_zeta_at null (never appeared in saldos)
 *  5. installment_stale — cuotas have very old vencimiento (all in past > 90d) → may be stale
 *  6. unknown           — none of the above
 */
function classifyCause(invoice, installmentSummary, lastSaldosSync) {
  const delta = installmentSummary.totalSaldo;
  const rec = readReconciliation(invoice.zeta_metadata);
  const fmt = invoiceFormat(invoice.invoice_number);
  const reasons = [];

  // Rounding tolerance: delta < 1
  if (delta < 1) {
    return { cause: "rounding", evidence: `delta=${delta} < 1 (tolerancia de redondeo)` };
  }

  // Orphan auto-close
  if (rec?.resolved_reason?.toLowerCase().includes("auto_closed")) {
    reasons.push(`resolved_reason=${rec.resolved_reason} at ${rec.resolved_at}`);
    return {
      cause: "orphan_auto_close",
      evidence: reasons.join("; "),
    };
  }
  if (rec && rec.pending_sync_missing_count >= 7) {
    return {
      cause: "orphan_auto_close_pending",
      evidence: `missing_count=${rec.pending_sync_missing_count} >= 7 (umbral auto-close); resolved_at=${rec.resolved_at ?? "null"}`,
    };
  }

  // Zero pass (CCV1 + has been seen in saldos before)
  if (fmt === "ccv1" && rec?.last_seen_in_zeta_at) {
    const staleDays = lastSaldosSync
      ? round2((Date.now() - Date.parse(lastSaldosSync)) / 86_400_000)
      : null;
    return {
      cause: "zero_pass",
      evidence: `CCV1 + last_seen_in_zeta_at=${rec.last_seen_in_zeta_at}; missing_count=${rec.pending_sync_missing_count ?? 0}; last_saldos_sync_days_ago=${staleDays ?? "?"}. Probablemente ausente en último sync de saldos para su clienteCodigo.`,
    };
  }

  // Legacy format + auto-close evidence
  if (fmt === "legacy" && rec?.last_seen_in_zeta_at) {
    const staleDays = lastSaldosSync
      ? round2((Date.now() - Date.parse(lastSaldosSync)) / 86_400_000)
      : null;
    const missingCount = rec.pending_sync_missing_count ?? 0;
    if (missingCount >= 3) {
      return {
        cause: "orphan_auto_close_near",
        evidence: `legacy format + missing_count=${missingCount} (camino a auto-close); last_seen=${rec.last_seen_in_zeta_at}; saldos_hace=${staleDays ?? "?"}d`,
      };
    }
    return {
      cause: "zeta_inconsistent",
      evidence: `legacy + last_seen_in_zeta_at=${rec.last_seen_in_zeta_at} pero balance_amount=0 sin auto-close; Zeta puede haber reportado saldo=0 cuando cuotas dicen lo contrario`,
    };
  }

  // Never seen in saldos
  if (!rec?.last_seen_in_zeta_at) {
    return {
      cause: "saldos_stale",
      evidence: `last_seen_in_zeta_at=null — invoice nunca apareció en QuerySaldosPendientes. Cuotas pueden ser de un sync de installments desacoplado.`,
    };
  }

  // All cuotas old
  if (installmentSummary.allOldVencimiento) {
    return {
      cause: "installment_stale",
      evidence: `Todas las cuotas tienen cuota_vencimiento > 90 días en el pasado. Posibles cuotas de ciclos anteriores ya pagadas que no se actualizaron.`,
    };
  }

  return { cause: "unknown", evidence: "Sin evidencia concluyente — investigar logs de saldos." };
}

// ---------------------------------------------------------------------------
// Source consistency check
// ---------------------------------------------------------------------------

function checkSourceConsistency(invoice, installments) {
  const invoiceRegistroId = readRegistroId(invoice.zeta_metadata);
  const installmentRegistroIds = [
    ...new Set(installments.map((r) => r.zeta_registro_id).filter(Boolean)),
  ];
  const issues = [];

  if (!invoiceRegistroId) {
    issues.push("invoice sin registro_id en zeta_metadata");
  } else if (installmentRegistroIds.length === 0) {
    issues.push("cuotas sin zeta_registro_id");
  } else if (!installmentRegistroIds.includes(invoiceRegistroId)) {
    issues.push(
      `registro_id mismatch: invoice=${invoiceRegistroId}, cuotas=[${installmentRegistroIds.join(",")}]`
    );
  }

  const currencies = [...new Set(installments.map((r) => r.currency_code).filter(Boolean))];
  if (currencies.length > 1) {
    issues.push(`cuotas de múltiples monedas: [${currencies.join(",")}]`);
  }

  // Check for duplicate cuotas (same vencimiento + saldo)
  const seen = new Set();
  let dupes = 0;
  for (const r of installments) {
    const key = `${r.cuota_vencimiento}|${r.cuota_saldo}|${r.currency_code}`;
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  if (dupes > 0) issues.push(`${dupes} cuota(s) duplicada(s) (mismo vencimiento+saldo+moneda)`);

  return {
    invoice_registro_id: invoiceRegistroId,
    installment_registro_ids: installmentRegistroIds,
    currencies,
    duplicate_cuotas: dupes,
    consistent: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const now = new Date().toISOString();
  console.log("=== ZETA-08 Audit: divergencia balance vs cuotas ===");
  console.log({ workspaceId, min_delta: MIN_DELTA, now });
  console.log();

  // --- 1. Últimos syncs ---
  console.log("Cargando sync state...");
  const { data: syncRows, error: syncErr } = await supabase
    .from("zeta_sync_state")
    .select("resource_flow, last_success_at, bootstrap_completed")
    .eq("company_id", workspaceId)
    .order("resource_flow");
  if (syncErr) console.warn("  WARN sync_state:", syncErr.message);

  const syncByFlow = {};
  for (const row of syncRows ?? []) {
    syncByFlow[row.resource_flow] = row;
  }
  const saldosKey = Object.keys(syncByFlow).find((k) => k.includes("saldos"));
  const vouchersKey = Object.keys(syncByFlow).find((k) => k.includes("voucher") || k.includes("ccv1"));
  const installmentsKey = Object.keys(syncByFlow).find((k) => k.includes("installment") || k.includes("cuota"));

  const lastSaldosSync = saldosKey ? syncByFlow[saldosKey].last_success_at : null;
  const lastVouchersSync = vouchersKey ? syncByFlow[vouchersKey].last_success_at : null;
  const lastInstallmentsSync = installmentsKey ? syncByFlow[installmentsKey].last_success_at : null;

  console.log("  Sync state:");
  for (const [flow, row] of Object.entries(syncByFlow)) {
    const ageDays = row.last_success_at
      ? round2((Date.now() - Date.parse(row.last_success_at)) / 86_400_000)
      : null;
    console.log(`    ${flow}: ${row.last_success_at ?? "NEVER"} (${ageDays ?? "?"}d ago, bootstrap=${row.bootstrap_completed})`);
  }
  console.log();

  // --- 2. Cargar facturas con balance = 0 ---
  console.log("Cargando facturas con balance_amount = 0...");
  let invoices;
  try {
    invoices = await fetchAll("proto_invoices", (from, to) =>
      supabase
        .from("proto_invoices")
        .select(
          "id, invoice_number, status, balance_amount, due_date, due_date_source, issue_date, updated_at, zeta_metadata, company_id"
        )
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true)
        .or("balance_amount.eq.0,balance_amount.is.null")
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    console.error("Error al cargar facturas:", e.message);
    process.exit(1);
  }
  console.log(`  Facturas con balance=0: ${invoices.length}`);

  if (invoices.length === 0) {
    console.log("  No hay facturas con balance=0. Diagnóstico no necesario.");
    return;
  }

  const invoiceIds = invoices.map((i) => i.id);

  // --- 3. Cargar cuotas de esas facturas ---
  console.log("Cargando cuotas de esas facturas...");
  let allInstallments;
  try {
    allInstallments = await fetchAll("proto_invoice_installments", (from, to) =>
      supabase
        .from("proto_invoice_installments")
        .select(
          "id, invoice_id, currency_code, cuota_saldo, cuota_total, cuota_vencimiento, zeta_registro_id, updated_at"
        )
        .eq("workspace_company_id", workspaceId)
        .in("invoice_id", invoiceIds)
        .order("invoice_id", { ascending: true })
        .order("cuota_vencimiento", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    console.error("Error al cargar cuotas:", e.message);
    process.exit(1);
  }
  console.log(`  Cuotas encontradas: ${allInstallments.length}`);
  console.log();

  // --- 4. Agrupar cuotas por invoice ---
  const installmentsByInvoice = new Map();
  for (const row of allInstallments) {
    if (!row.invoice_id) continue;
    const list = installmentsByInvoice.get(row.invoice_id) ?? [];
    list.push(row);
    installmentsByInvoice.set(row.invoice_id, list);
  }

  // --- 5. Detectar divergencias ---
  const NOW_MS = Date.now();
  const divergencias = [];

  for (const inv of invoices) {
    const rows = installmentsByInvoice.get(inv.id) ?? [];
    if (rows.length === 0) continue;

    const openCuotas = rows.filter((r) => safeNum(r.cuota_saldo) > MIN_DELTA);
    if (openCuotas.length === 0) continue;

    const totalSaldo = round2(openCuotas.reduce((s, r) => s + safeNum(r.cuota_saldo), 0));
    if (totalSaldo <= MIN_DELTA) continue;

    const invBalance = safeNum(inv.balance_amount);
    const delta = round2(Math.abs(totalSaldo - invBalance));

    // oldness: all cuotas > 90 days past vencimiento?
    const allOldVencimiento = openCuotas.every((r) => {
      if (!r.cuota_vencimiento) return false;
      const ms = Date.parse(r.cuota_vencimiento + "T00:00:00Z");
      return Number.isFinite(ms) && (NOW_MS - ms) / 86_400_000 > 90;
    });

    const latestCuotaUpdate = openCuotas
      .map((r) => r.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    const currencies = [...new Set(openCuotas.map((r) => r.currency_code).filter(Boolean))];

    const installmentSummary = {
      totalSaldo,
      openCount: openCuotas.length,
      allOldVencimiento,
      currencies,
      latestCuotaUpdate,
      nextVencimiento: openCuotas.map((r) => r.cuota_vencimiento).filter(Boolean).sort().at(0) ?? null,
    };

    const rec = readReconciliation(inv.zeta_metadata);
    const sourceConsistency = checkSourceConsistency(inv, openCuotas);
    const { cause, evidence } = classifyCause(inv, installmentSummary, lastSaldosSync);

    divergencias.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      format: invoiceFormat(inv.invoice_number),
      status: inv.status,
      invoice_balance: invBalance,
      installment_balance: totalSaldo,
      delta,
      issue_date: inv.issue_date ?? null,
      due_date: inv.due_date ?? null,
      due_date_source: inv.due_date_source ?? null,
      invoice_updated_at: inv.updated_at ?? null,
      open_cuotas: openCuotas.length,
      currencies,
      latest_cuota_update: latestCuotaUpdate,
      next_cuota_vencimiento: installmentSummary.nextVencimiento,
      all_cuotas_old: allOldVencimiento,
      zeta_registro_ids: sourceConsistency.installment_registro_ids,
      invoice_registro_id: sourceConsistency.invoice_registro_id,
      reconciliation: rec,
      source_consistency: sourceConsistency,
      suspected_cause: cause,
      evidence,
    });
  }

  if (divergencias.length === 0) {
    console.log(`✓ Sin divergencias con delta > ${MIN_DELTA}. Sistema consistente.`);
    return;
  }

  // --- 6. Clasificar grupos ---
  const byGroup = {};
  for (const d of divergencias) {
    byGroup[d.suspected_cause] = (byGroup[d.suspected_cause] ?? []);
    byGroup[d.suspected_cause].push(d);
  }

  // --- 7. Resumen ---
  console.log("══════════════════════════════════════════════════════════");
  console.log(`DIVERGENCIAS DETECTADAS: ${divergencias.length} factura(s)`);
  console.log("══════════════════════════════════════════════════════════");
  console.log();

  console.log("── Por grupo ──");
  for (const [cause, items] of Object.entries(byGroup).sort((a, b) => b[1].length - a[1].length)) {
    const totalHidden = round2(items.reduce((s, d) => s + d.installment_balance, 0));
    const currencies = [...new Set(items.flatMap((d) => d.currencies))].join("+");
    console.log(`  ${cause.padEnd(25)} ${String(items.length).padStart(3)} factura(s)   hidden=${totalHidden} ${currencies}`);
  }
  console.log();

  // --- 8. Detalle por factura ---
  console.log("── Detalle por factura ──");
  console.log();

  for (const d of divergencias.sort((a, b) => b.installment_balance - a.installment_balance)) {
    const ageInvoice = d.invoice_updated_at
      ? round2((Date.now() - Date.parse(d.invoice_updated_at)) / 86_400_000) + "d"
      : "?";
    const ageCuota = d.latest_cuota_update
      ? round2((Date.now() - Date.parse(d.latest_cuota_update)) / 86_400_000) + "d"
      : "?";

    const missingCount = d.reconciliation?.pending_sync_missing_count ?? 0;
    const lastSeen = d.reconciliation?.last_seen_in_zeta_at
      ? new Date(d.reconciliation.last_seen_in_zeta_at).toISOString().slice(0, 10)
      : "NUNCA";
    const resolvedAt = d.reconciliation?.resolved_at
      ? new Date(d.reconciliation.resolved_at).toISOString().slice(0, 10)
      : null;

    console.log(`▸ ${d.invoice_number}`);
    console.log(`  id:              ${d.invoice_id}`);
    console.log(`  format:          ${d.format}`);
    console.log(`  status:          ${d.status}`);
    console.log(`  balance (inv):   ${d.invoice_balance}`);
    console.log(`  balance (cuot):  ${d.installment_balance}   (${d.open_cuotas} cuota(s) abierta(s), ${d.currencies.join("/")})`);
    console.log(`  delta:           ${d.delta}`);
    console.log(`  due_date:        ${d.due_date ?? "-"}  (${d.due_date_source ?? "synthetic"})`);
    console.log(`  issue_date:      ${d.issue_date ?? "-"}`);
    console.log(`  next_vencim:     ${d.next_cuota_vencimiento ?? "-"}`);
    console.log(`  all_cuotas_old:  ${d.all_cuotas_old}`);
    console.log(`  inv_updated:     ${d.invoice_updated_at?.slice(0, 19) ?? "-"}  (${ageInvoice} ago)`);
    console.log(`  cuot_updated:    ${d.latest_cuota_update?.slice(0, 19) ?? "-"}  (${ageCuota} ago)`);
    console.log(`  registro_id:     invoice=${d.invoice_registro_id ?? "MISSING"} | cuotas=[${d.zeta_registro_ids.join(",")}]`);
    console.log(`  reconciliation:  last_seen=${lastSeen}  missing_count=${missingCount}  resolved_at=${resolvedAt ?? "—"}  reason=${d.reconciliation?.resolved_reason ?? "—"}`);

    if (!d.source_consistency.consistent) {
      console.log(`  ⚠ consistency:   ${d.source_consistency.issues.join("; ")}`);
    }

    console.log(`  ▶ suspected_cause: ${d.suspected_cause}`);
    console.log(`    evidence: ${d.evidence}`);
    console.log();
  }

  // --- 9. Source of truth analysis ---
  const totalHiddenByGroup = {};
  for (const d of divergencias) {
    totalHiddenByGroup[d.suspected_cause] = round2(
      (totalHiddenByGroup[d.suspected_cause] ?? 0) + d.installment_balance
    );
  }

  const totalHidden = round2(divergencias.reduce((s, d) => s + d.installment_balance, 0));
  const hasZeroPass = byGroup["zero_pass"]?.length > 0;
  const hasOrphanClose = (byGroup["orphan_auto_close"]?.length ?? 0) + (byGroup["orphan_auto_close_pending"]?.length ?? 0) > 0;
  const hasConsistencyIssues = divergencias.some((d) => !d.source_consistency.consistent);

  console.log("══════════════════════════════════════════════════════════");
  console.log("ANÁLISIS SOURCE OF TRUTH");
  console.log("══════════════════════════════════════════════════════════");
  console.log();
  console.log(`Total overdue oculto:     ${totalHidden}`);
  console.log(`Facturas afectadas:       ${divergencias.length}`);
  console.log(`Tiene zero_pass cases:    ${hasZeroPass}`);
  console.log(`Tiene orphan_close cases: ${hasOrphanClose}`);
  console.log(`Tiene consistency issues: ${hasConsistencyIssues}`);
  console.log();

  // --- 10. Recomendación ---
  console.log("── Recomendación source of truth ──");
  console.log();

  if (divergencias.every((d) => d.suspected_cause === "rounding")) {
    console.log("  DIAGNÓSTICO: Todas las diferencias son de redondeo (< 1 UYU/USD).");
    console.log("  FUENTE VERDAD: balance_amount de factura es confiable.");
    console.log("  RIESGO: Mínimo.");
    console.log("  ACCIÓN: Ajustar BALANCE_MISMATCH_EPSILON a 1.0 en coverage checks.");
  } else if (hasZeroPass && !hasOrphanClose) {
    console.log("  DIAGNÓSTICO: zeroCcV1BalancesWithoutSaldoRow pisó balances de facturas");
    console.log("  que NO aparecieron en el último sync de saldos para su clienteCodigo.");
    console.log("  Las cuotas reflejan la deuda real; invoice.balance_amount fue sobreescrito.");
    console.log();
    console.log("  FUENTE VERDAD RECOMENDADA: Σ cuota_saldo (installments)");
    console.log("  CONDICIÓN: coveragePct=100% y orphanCount=0 (ambos cumplidos actualmente).");
    console.log();
    console.log("  FIX STRATEGY (safe, incremental):");
    console.log("    Fase 1 [AHORA]:  Agregar guard en zeroCcV1BalancesWithoutSaldoRow:");
    console.log("                     antes de zeroing, verificar Σ cuota_saldo = 0.");
    console.log("                     Si Σ cuota_saldo > 0: skip + log 'zero_pass_blocked_by_installments'.");
    console.log("    Fase 2 [POST-FIX]: Script de backfill:");
    console.log("                     Para cada factura afectada: balance_amount = Σ cuota_saldo, status=partial.");
    console.log("    Fase 3 [ONGOING]: Health check: alertar si invoice.balance=0 && Σcuota>0.");
  } else if (hasOrphanClose) {
    console.log("  DIAGNÓSTICO: Orphan auto-close cerró facturas que tenían cuotas abiertas.");
    console.log("  El guard de 'last_seen_in_zeta_at' no es suficiente cuando Zeta");
    console.log("  deja de reportar una factura aunque sus cuotas sigan pendientes.");
    console.log();
    console.log("  FUENTE VERDAD: AMBIGUA — necesita investigación Zeta.");
    console.log("  RIESGO: Alto si Zeta tiene deuda real no reportada en QuerySaldosPendientes.");
    console.log();
    console.log("  FIX STRATEGY:");
    console.log("    Fase 1 [AHORA]:  Agregar guard en reconcileMissingPendingInvoices:");
    console.log("                     skip auto-close si Σ cuota_saldo > 0.");
    console.log("    Fase 2 [MANUAL]: Consultar Zeta directamente (API vouchers) para");
    console.log("                     las facturas afectadas y validar saldo real.");
    console.log("    Fase 3:          Definir qué pesa más: Zeta saldos (booking) o cuotas (plan de pago).");
  } else {
    console.log("  DIAGNÓSTICO: Mixto — múltiples causas.");
    console.log("  FUENTE VERDAD: Evaluar factura por factura.");
    console.log("  Ver detalle por grupo arriba.");
  }

  console.log();
  console.log("── Pasos inmediatos ──");
  console.log("  1. Ejecutar con --min-delta 0.01 para filtrar ruido de redondeo.");
  console.log("  2. Validar el grupo 'zero_pass' revisando logs kind=zeta_saldos_zero_pass_applied.");
  console.log("  3. Validar el grupo 'orphan_auto_close' revisando logs kind=zeta_reconcile_auto_closed.");
  console.log("  4. Antes de corregir en DB: esperar un ciclo de saldos sync completo.");
  console.log("     Si las facturas reaparecen en saldos → balance_amount se autocorrige.");
  console.log("     Si no reaparecen → investigar con Zeta antes de backfill.");
  console.log();

  // --- 11. JSON exportable ---
  console.log("── JSON exportable (pegarlo en herramienta de análisis) ──");
  console.log(
    JSON.stringify(
      {
        generated_at: now,
        workspace_id: workspaceId,
        total_divergencias: divergencias.length,
        total_hidden_balance: totalHidden,
        min_delta_used: MIN_DELTA,
        last_saldos_sync: lastSaldosSync,
        last_vouchers_sync: lastVouchersSync,
        last_installments_sync: lastInstallmentsSync,
        by_group: Object.fromEntries(
          Object.entries(byGroup).map(([k, v]) => [k, {
            count: v.length,
            total_hidden: round2(v.reduce((s, d) => s + d.installment_balance, 0)),
          }])
        ),
        divergencias: divergencias.map((d) => ({
          invoice_id: d.invoice_id,
          invoice_number: d.invoice_number,
          format: d.format,
          status: d.status,
          invoice_balance: d.invoice_balance,
          installment_balance: d.installment_balance,
          delta: d.delta,
          open_cuotas: d.open_cuotas,
          currencies: d.currencies,
          due_date: d.due_date,
          due_date_source: d.due_date_source,
          issue_date: d.issue_date,
          next_cuota_vencimiento: d.next_cuota_vencimiento,
          all_cuotas_old: d.all_cuotas_old,
          invoice_updated_at: d.invoice_updated_at,
          latest_cuota_update: d.latest_cuota_update,
          invoice_registro_id: d.invoice_registro_id,
          installment_registro_ids: d.zeta_registro_ids,
          reconciliation: d.reconciliation,
          source_consistency: {
            consistent: d.source_consistency.consistent,
            issues: d.source_consistency.issues,
            duplicate_cuotas: d.source_consistency.duplicate_cuotas,
          },
          suspected_cause: d.suspected_cause,
          evidence: d.evidence,
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
