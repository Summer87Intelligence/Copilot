#!/usr/bin/env node
/**
 * FASE 4 — Restauración de balance_amount desde raw saldos Zeta.
 *
 * Para facturas con balance_amount = 0 donde Zeta muestra saldo > 0:
 *  1. Busca el RegistroId de la factura en zeta_sync_raw_payloads.
 *  2. Lee el Saldo del payload (fuente autorizada: Zeta, no cuotas).
 *  3. Actualiza balance_amount + status en proto_invoices.
 *  4. Registra auditoría en zeta_metadata.backfills.balance_from_zeta_saldos.
 *  5. Resetea pending_sync_missing_count a 0 y actualiza last_seen_in_zeta_at.
 *
 * Seguridad:
 *  - Dry-run por defecto. Requiere --apply para escribir.
 *  - Solo actualiza si saldo > 0 en el payload (nunca forza balance 0).
 *  - Solo actualiza si la factura tiene balance_amount ≤ EPS (no sobreescribe saldos activos).
 *  - Nunca calcula balance desde cuotas — solo desde raw payload Zeta.
 *  - Idempotente: si balance ya coincide, skip.
 *  - Multi-tenant: workspace_company_id en todas las queries.
 *  - Solo páginas completas (no truncadas) son fuente de verdad de saldo.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/backfill-balance-from-zeta-saldos.mjs
 *   node --env-file=.env.local --import tsx scripts/backfill-balance-from-zeta-saldos.mjs --apply
 *   node --env-file=.env.local --import tsx scripts/backfill-balance-from-zeta-saldos.mjs --apply --client-code 0
 *   node --env-file=.env.local --import tsx scripts/backfill-balance-from-zeta-saldos.mjs --apply --invoice-number ZETA:CCV1:0:2:A:2937
 *   node --env-file=.env.local --import tsx scripts/backfill-balance-from-zeta-saldos.mjs --apply --raw-pages 50
 *
 * Flags:
 *   --apply                Aplica cambios en DB. Sin este flag es dry-run.
 *   --workspace <UUID>     Workspace. Default: WORKSPACE_COMPANY_ID
 *   --client-code <code>   Filtrar por clienteCodigo (segmento 3 del invoice_number)
 *   --invoice-number <n>   Filtrar por invoice_number exacto
 *   --raw-pages <N>        Cuántas páginas raw cargar. Default: 50
 *   --reset-missing-count  Resetea pending_sync_missing_count a 0 tras actualizar
 *
 * RESTRICCIONES ABSOLUTAS:
 *   - Nunca actualiza si saldo del payload = 0 o ausente
 *   - Nunca calcula balance desde installments
 *   - Nunca actualiza invoices con balance_amount > EPS (ya tienen saldo activo)
 *   - Nunca toca RLS, vouchers balance policy ni installments
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Env & args ────────────────────────────────────────────────────────────────

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
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

const DRY_RUN = !args.includes("--apply");
const RESET_MISSING_COUNT = args.includes("--reset-missing-count");
const RAW_PAGES_LIMIT = Math.max(1, parseInt(argFlag("--raw-pages") ?? "50", 10));
const FILTER_CLIENT_CODE = argFlag("--client-code");
const FILTER_INVOICE_NUMBER = argFlag("--invoice-number");

const EPS = 0.005;
const AMOUNT_TOL = 0.02;
const SALDOS_FLOW = "factura_cliente_saldos_pendientes";
const SALDOS_OPERATION = "RESTFacturaClienteV4QuerySaldosPendientes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

if (!url || !key || !workspaceId) {
  console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function extractRegistroIds(zetaMeta) {
  if (!zetaMeta || typeof zetaMeta !== "object") return [];
  const out = new Set();
  const id1 = zetaMeta?.zeta_comprobante_identity_v1?.registro_id;
  if (id1) out.add(String(id1).trim());
  const v1 = zetaMeta?.zeta_customer_voucher_v1;
  if (v1?.zeta_registro_id) out.add(String(v1.zeta_registro_id).trim());
  const raw = v1?.raw_payload;
  if (raw?.RegistroId) out.add(String(raw.RegistroId).trim());
  if (raw?.registroId) out.add(String(raw.registroId).trim());
  return [...out].filter((r) => r && r !== "0");
}

function parseInvoiceNumberParts(inv) {
  const p = String(inv).split(":");
  if (p[0] !== "ZETA" || p[1] !== "CCV1" || p.length < 6) return null;
  return { clienteCodigo: p[2] ?? null, serie: p[4] ?? null, numero: p[5] ?? null };
}

// ── Raw payload parsing ───────────────────────────────────────────────────────

/**
 * Extrae Map<registroId, { saldo, clienteCodigo, monedaNombre, fromTruncated }> de un payload_json.
 *
 * Estrategia:
 *  - Payload completo (policy "full-under-cap"): parsea body.Response directamente.
 *  - Payload truncado (policy "truncated"): extrae objetos de fila completos desde
 *    preview_json_text usando regex. Rows parcialmente cortados al final del preview
 *    se ignoran. Solo filas con RegistroId + Saldo + MonedaNombre completos se incluyen.
 *
 * Retorna null solo si el payload es invalido o vacio (nunca por truncation alone).
 */
function extractSaldoMapFromPayload(payloadJson) {
  if (!payloadJson || typeof payloadJson !== "object") return null;
  const policy = payloadJson._staging_policy ?? "";

  // ── Truncated: regex extraction from preview_json_text ──
  if (policy.includes("truncated")) {
    const preview = payloadJson.preview_json_text;
    if (typeof preview !== "string" || !preview) return null;
    return extractSaldoMapFromJsonText(preview, true);
  }

  // ── Full payload: parse body.QuerySaldosPendientesOut.Response ──
  const body = payloadJson.body;
  if (!body || typeof body !== "object") return null;

  // Real DB structure: body.QuerySaldosPendientesOut.Response
  const wrapper = body.QuerySaldosPendientesOut ?? body.querySaldosPendientesOut ?? body;
  let response = wrapper.Response ?? wrapper.response;
  if (typeof response === "string") {
    try { response = JSON.parse(response); } catch { return null; }
  }
  if (Array.isArray(response)) {
    return extractSaldoMapFromRows(response, false);
  }

  // Fallback: try parsing the whole body as JSON text (edge case)
  try {
    const bodyText = JSON.stringify(body);
    return extractSaldoMapFromJsonText(bodyText, false);
  } catch {
    return null;
  }
}

/**
 * Extrae filas de saldo desde un array de objetos ya parseados.
 * Incluye registroId, serie y numero para habilitar match secundario.
 */
function extractSaldoMapFromRows(rows, fromTruncated) {
  const out = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rid = String(row.RegistroId ?? row.registroId ?? "").trim();
    if (!rid || rid === "0") continue;
    const saldoRaw = row.Saldo ?? row.saldo;
    if (saldoRaw == null || saldoRaw === "") continue;
    const saldo = num(saldoRaw);
    const clienteCodigo = String(row.ClienteCodigo ?? row.clienteCodigo ?? "").trim();
    const monedaNombre = String(row.MonedaNombre ?? row.monedaNombre ?? "").trim();
    const serie = String(row.Serie ?? row.serie ?? "").trim();
    const numero = String(row.Numero ?? row.numero ?? "").trim();
    out.set(rid, { saldo, clienteCodigo, monedaNombre, fromTruncated, registroId: rid, serie, numero });
  }
  return out;
}

/**
 * Extrae filas de saldo desde texto JSON crudo (puede estar truncado).
 * Busca el array "Response" dentro del texto y parsea cada objeto de fila individualmente.
 * Objetos parcialmente cortados al final del preview se descartan silenciosamente.
 */
function extractSaldoMapFromJsonText(text, fromTruncated) {
  const out = new Map();

  // Encontrar el comienzo del array Response — es donde están las filas de saldo
  const responseMatch = text.match(/"Response"\s*:\s*\[/);
  if (!responseMatch) return null;

  let pos = (responseMatch.index ?? 0) + responseMatch[0].length;

  while (pos < text.length) {
    // Saltar espacios, comas y newlines entre objetos
    while (pos < text.length && " ,\n\r\t".includes(text[pos])) pos++;
    if (pos >= text.length) break;
    if (text[pos] === "]") break; // fin del array
    if (text[pos] !== "{") break; // formato inesperado

    // Buscar el '}' de cierre balanceado para este objeto de fila
    let depth = 0;
    let end = -1;
    for (let j = pos; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }

    if (end < 0) break; // objeto cortado al final del preview — stop

    const objText = text.slice(pos, end + 1);
    try {
      const row = JSON.parse(objText);
      if (row && typeof row === "object") {
        const rid = String(row.RegistroId ?? row.registroId ?? "").trim();
        if (rid && rid !== "0" && (row.Saldo != null || row.saldo != null)) {
          const saldoRaw = row.Saldo ?? row.saldo;
          const saldo = num(saldoRaw);
          const clienteCodigo = String(row.ClienteCodigo ?? row.clienteCodigo ?? "").trim();
          const monedaNombre = String(row.MonedaNombre ?? row.monedaNombre ?? "").trim();
          const serie = String(row.Serie ?? row.serie ?? "").trim();
          const numero = String(row.Numero ?? row.numero ?? "").trim();
          if (!out.has(rid)) {
            out.set(rid, { saldo, clienteCodigo, monedaNombre, fromTruncated, registroId: rid, serie, numero });
          }
        }
      }
    } catch {
      // Objeto inválido en esta posición — skip e intentar el siguiente
    }

    pos = end + 1;
  }

  return out.size > 0 ? out : null;
}

function normalizeStatus(saldo) {
  return saldo <= EPS ? "paid" : "issued";
}

function normalizeCurrencyCode(monedaNombre) {
  const u = (monedaNombre ?? "").trim().toUpperCase();
  if (u === "U$S" || u === "USD" || u.includes("DOLAR")) return "USD";
  if (u === "$" || u === "UYU" || u.includes("PES")) return "UYU";
  return null;
}

// ── DB fetchers ───────────────────────────────────────────────────────────────

async function fetchAllPages(label, buildQuery) {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchZeroBalanceInvoices() {
  let q = supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, status, zeta_metadata, company_id, currency_code, updated_at")
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "ZETA:CCV1:%")
    .eq("is_active", true);

  if (FILTER_INVOICE_NUMBER) {
    q = q.eq("invoice_number", FILTER_INVOICE_NUMBER);
  }

  const rows = await fetchAllPages("zero_invoices", (from, to) =>
    q.order("id", { ascending: true }).range(from, to)
  );

  return rows.filter((r) => round2(num(r.balance_amount)) <= EPS);
}

/**
 * Carga las últimas N páginas de raw saldos y construye un mapa rid → saldo.
 * Soporta páginas completas y truncadas (extrae rows completos del preview_json_text).
 * Retorna Map<registroId, { saldo, clienteCodigo, monedaNombre, pageId, receivedAt, fromTruncated }>
 */
async function buildSaldoMapFromRawPayloads() {
  const { data, error } = await supabase
    .from("zeta_sync_raw_payloads")
    .select("id, payload_json, received_at")
    .eq("resource_flow", SALDOS_FLOW)
    .eq("zeta_operation", SALDOS_OPERATION)
    .order("received_at", { ascending: false })
    .limit(RAW_PAGES_LIMIT);

  if (error) throw new Error(`zeta_sync_raw_payloads: ${error.message}`);

  const pages = data ?? [];
  const ridMap = new Map();
  let completedPages = 0;
  let truncatedPages = 0;
  let truncatedWithRows = 0;
  let nullPages = 0;

  // Secondary index: clienteCodigo:serie:numero → entry (for invoices with null RegistroId)
  const saldoByNumero = new Map();

  for (const page of pages) {
    const saldoMap = extractSaldoMapFromPayload(page.payload_json);
    const isTruncated = (page.payload_json?._staging_policy ?? "").includes("truncated");

    if (saldoMap === null) {
      nullPages++;
      continue;
    }
    if (isTruncated) {
      truncatedPages++;
      if (saldoMap.size > 0) truncatedWithRows++;
    } else {
      completedPages++;
    }
    for (const [rid, entry] of saldoMap) {
      const fullEntry = { ...entry, pageId: page.id, receivedAt: page.received_at };
      if (!ridMap.has(rid)) {
        ridMap.set(rid, fullEntry);
      }
      // Secondary index by numero (first occurrence wins — most recent page)
      if (entry.clienteCodigo && entry.serie && entry.numero) {
        const numKey = `${entry.clienteCodigo}:${entry.serie}:${entry.numero}`;
        if (!saldoByNumero.has(numKey)) {
          saldoByNumero.set(numKey, fullEntry);
        }
      }
    }
  }

  return { ridMap, saldoByNumero, completedPages, truncatedPages, truncatedWithRows, nullPages, pagesConsidered: pages.length };
}

// ── zeta_metadata patch ───────────────────────────────────────────────────────

/**
 * @param {object} existing - existing zeta_metadata object
 * @param {object} entry - saldo entry from raw payload (includes registroId if from secondary match)
 * @param {string} nowIso
 * @param {object} runInfo
 * @param {{ fromNumeroMatch: boolean }} opts
 */
function buildMetadataPatch(existing, entry, nowIso, runInfo, opts = {}) {
  const meta = existing && typeof existing === "object" ? structuredClone(existing) : {};

  // Patch backfills
  const backfills = meta.backfills && typeof meta.backfills === "object" ? { ...meta.backfills } : {};
  backfills.balance_from_zeta_saldos = {
    at: nowIso,
    saldo: entry.saldo,
    clienteCodigo: entry.clienteCodigo,
    raw_payload_id: entry.pageId,
    applied_by: "backfill-balance-from-zeta-saldos.mjs",
    match_method: opts.fromNumeroMatch ? "numero_fallback" : "registro_id",
    script_run: runInfo,
  };
  meta.backfills = backfills;

  // If matched via numero (invoice had null registroId), backfill the RegistroId into metadata
  // so the saldo pipeline can match it going forward
  if (opts.fromNumeroMatch && entry.registroId) {
    if (!meta.zeta_comprobante_identity_v1 || typeof meta.zeta_comprobante_identity_v1 !== "object") {
      meta.zeta_comprobante_identity_v1 = { schema_version: 1 };
    }
    meta.zeta_comprobante_identity_v1 = {
      ...meta.zeta_comprobante_identity_v1,
      registro_id: entry.registroId,
    };
    if (meta.zeta_customer_voucher_v1 && typeof meta.zeta_customer_voucher_v1 === "object") {
      meta.zeta_customer_voucher_v1 = {
        ...meta.zeta_customer_voucher_v1,
        zeta_registro_id: entry.registroId,
      };
    }
  }

  // Patch reconciliation state: reset missing count, update last_seen
  const rec = meta.zeta_reconciliation && typeof meta.zeta_reconciliation === "object"
    ? { ...meta.zeta_reconciliation }
    : {};
  rec.last_seen_in_zeta_at = entry.receivedAt ?? nowIso;
  if (RESET_MISSING_COUNT) {
    rec.pending_sync_missing_count = 0;
    rec.last_missing_detected_at = null;
    rec.resolved_at = nowIso;
    rec.resolved_reason = "backfill_balance_from_zeta_saldos";
    rec.resolved_automatically = false;
  }
  meta.zeta_reconciliation = rec;

  return meta;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();
  const runInfo = { started_at: startedAt, dry_run: DRY_RUN };

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 4 — Backfill balance_amount desde raw saldos Zeta");
  console.log("═══════════════════════════════════════════════════════════");
  console.log({
    mode: DRY_RUN ? "DRY-RUN (no changes)" : "APPLY",
    workspace: workspaceId,
    filterClientCode: FILTER_CLIENT_CODE ?? "(todos)",
    filterInvoiceNumber: FILTER_INVOICE_NUMBER ?? "(todas)",
    rawPagesLimit: RAW_PAGES_LIMIT,
    resetMissingCount: RESET_MISSING_COUNT,
    startedAt,
  });
  console.log();

  if (DRY_RUN) {
    console.log("  ⚠ Modo DRY-RUN activo. Para aplicar: --apply");
    console.log();
  }

  // 1. Cargar raw saldos map
  console.log("Cargando raw saldos payloads...");
  const { ridMap, saldoByNumero, completedPages, truncatedPages, truncatedWithRows, nullPages, pagesConsidered } =
    await buildSaldoMapFromRawPayloads();
  console.log(`  Páginas consideradas:  ${pagesConsidered}`);
  console.log(`  Páginas completas:     ${completedPages}`);
  console.log(`  Páginas truncadas:     ${truncatedPages} (${truncatedWithRows} con rows extraídos por regex)`);
  if (nullPages > 0) console.log(`  Páginas sin datos:     ${nullPages}`);
  console.log(`  RegistroIds en mapa:   ${ridMap.size}`);
  console.log(`  Numero keys en mapa:   ${saldoByNumero.size}`);
  if (truncatedPages > 0 && truncatedWithRows < truncatedPages) {
    console.log(`  ⚠ ${truncatedPages - truncatedWithRows} página(s) truncadas sin rows extraíbles (preview sin objetos completos)`);
  }
  if (ridMap.size === 0) {
    console.log();
    console.log("⚠ No se encontraron saldos en raw payloads.");
    console.log("  Verificar que haya corridas de saldos pendientes en zeta_sync_raw_payloads.");
    console.log("  Aumentar --raw-pages si las páginas recientes no cubren los clientes afectados.");
    return;
  }
  console.log();

  // 2. Cargar facturas con balance = 0
  console.log("Cargando facturas CCV1 con balance_amount = 0...");
  const zeroInvoices = await fetchZeroBalanceInvoices();
  console.log(`  Facturas con balance=0: ${zeroInvoices.length}`);

  if (zeroInvoices.length === 0) {
    console.log("✓ No hay facturas con balance=0. Nada que hacer.");
    return;
  }

  // 3. Cruzar: invoice → RegistroId → saldo en payload
  console.log("\nAnalizando matches...");

  const candidates = []; // { inv, rid, entry, fromNumeroMatch }
  const noMatch = [];
  const filteredByClient = [];

  for (const inv of zeroInvoices) {
    const parts = parseInvoiceNumberParts(inv.invoice_number);

    // Filtro por clienteCodigo si aplica (p[2] = workspace prefix segment)
    if (FILTER_CLIENT_CODE && parts?.clienteCodigo !== FILTER_CLIENT_CODE) {
      filteredByClient.push(inv);
      continue;
    }

    // Primary match: by RegistroId from zeta_metadata
    const rids = extractRegistroIds(inv.zeta_metadata);
    let found = false;
    for (const rid of rids) {
      const entry = ridMap.get(rid);
      if (entry && entry.saldo > EPS) {
        candidates.push({ inv, rid, entry, fromNumeroMatch: false });
        found = true;
        break;
      }
    }

    // Secondary match: by clienteCodigo:serie:numero (for invoices with null RegistroId)
    if (!found) {
      const v1 = inv.zeta_metadata?.zeta_customer_voucher_v1;
      const zetaClienteCodigo = v1?.zeta_cliente_codigo ?? v1?.raw_payload?.ClienteCodigo ?? null;
      const serie = v1?.serie ?? null;
      const numero = v1?.numero ?? null;
      if (zetaClienteCodigo && serie && numero) {
        const numKey = `${zetaClienteCodigo}:${serie}:${numero}`;
        const entry = saldoByNumero.get(numKey);
        if (entry && entry.saldo > EPS) {
          candidates.push({ inv, rid: entry.registroId, entry, fromNumeroMatch: true });
          found = true;
        }
      }
    }

    if (!found) noMatch.push({ inv, rids });
  }

  const ridMatchCount = candidates.filter((c) => !c.fromNumeroMatch).length;
  const numMatchCount = candidates.filter((c) => c.fromNumeroMatch).length;
  console.log(`  Con match en payload (saldo>0): ${candidates.length} (RID: ${ridMatchCount}, numero: ${numMatchCount})`);
  console.log(`  Sin match o saldo=0 en payload: ${noMatch.length}`);
  if (filteredByClient.length > 0) {
    console.log(`  Excluidas por filtro clienteCodigo: ${filteredByClient.length}`);
  }

  if (candidates.length === 0) {
    console.log();
    console.log("⚠ No se encontraron facturas con saldo>0 en el payload raw.");
    console.log("  Posibles causas:");
    console.log("  1. El pipeline de saldos aún no corrió para estos clientes.");
    console.log("  2. Las páginas raw están truncadas (excluyeron el saldo).");
    console.log("  3. El RegistroId en zeta_metadata no coincide con el del payload.");
    console.log("  Acción: correr audit-zeta-balance-missing-in-db.mjs para diagnóstico detallado.");
    return;
  }

  // Mostrar candidatos
  console.log();
  console.log("── Candidatos a actualizar ──────────────────────────────");
  for (const { inv, rid, entry, fromNumeroMatch } of candidates) {
    const cur = round2(num(inv.balance_amount));
    const matchLabel = fromNumeroMatch ? " [via numero]" : " [via RID]";
    console.log(
      `  ${inv.invoice_number}${matchLabel}\n` +
      `    rid=${rid}  saldo_payload=${entry.saldo.toFixed(2)}  balance_actual=${cur.toFixed(2)}` +
      `  moneda=${entry.monedaNombre}  cliente=${entry.clienteCodigo}`
    );
    if (fromNumeroMatch) {
      console.log(`    ⚠ registro_id era null → se parchará en zeta_metadata con rid=${rid}`);
    }
  }

  if (noMatch.length > 0) {
    console.log();
    console.log("── Sin match en payload (no se actualizan) ──────────────");
    if (noMatch.length <= 15) {
      for (const { inv, rids } of noMatch) {
        console.log(`  ${inv.invoice_number}  rids=[${rids.join(",")}]`);
      }
    } else {
      console.log(`  (primeras 15 de ${noMatch.length})`);
      for (const { inv, rids } of noMatch.slice(0, 15)) {
        console.log(`  ${inv.invoice_number}  rids=[${rids.join(",")}]`);
      }
    }
    console.log();
    console.log("  Causas posibles para 'sin match':");
    console.log("  1. Registro no está en los últimos raw pages cargados → aumentar --raw-pages.");
    console.log("  2. RegistroId en zeta_metadata es null, 0 o vacío (timing_gap).");
    console.log("  3. Zeta no devuelve más saldo para este comprobante → ya cobrado.");
    console.log("  4. Factura pre-operacional o formato legacy (no ZETA:CCV1).");
  }

  // 4. Aplicar si --apply
  if (DRY_RUN) {
    console.log();
    console.log("── DRY-RUN: sin cambios aplicados ───────────────────────");
    console.log(`  Para actualizar ${candidates.length} factura(s): correr con --apply`);
    if (RESET_MISSING_COUNT) {
      console.log("  + --reset-missing-count: resetea pending_sync_missing_count a 0");
    }
    return;
  }

  console.log();
  console.log("── Aplicando actualizaciones en DB ──────────────────────");
  const nowIso = new Date().toISOString();
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { inv, rid, entry, fromNumeroMatch } of candidates) {
    const newBalance = round2(entry.saldo);
    const newStatus = normalizeStatus(entry.saldo);
    const currCode = normalizeCurrencyCode(entry.monedaNombre);

    // Guard: si en este momento el balance ya coincide, skip (idempotencia)
    const currentBalance = round2(num(inv.balance_amount));
    if (Math.abs(currentBalance - newBalance) <= AMOUNT_TOL) {
      console.log(`  skip (ya coincide): ${inv.invoice_number} balance=${currentBalance}`);
      skipped++;
      continue;
    }

    const newMeta = buildMetadataPatch(
      inv.zeta_metadata,
      { ...entry, pageId: entry.pageId, receivedAt: entry.receivedAt },
      nowIso,
      runInfo,
      { fromNumeroMatch: fromNumeroMatch === true }
    );

    const updatePayload = {
      balance_amount: newBalance,
      status: newStatus,
      zeta_metadata: newMeta,
    };
    if (currCode) updatePayload.currency_code = currCode;

    const { error } = await supabase
      .from("proto_invoices")
      .update(updatePayload)
      .eq("id", inv.id)
      .eq("workspace_company_id", workspaceId)
      .lte("balance_amount", EPS); // guard extra: solo actualiza si balance sigue ≤ EPS

    if (error) {
      console.error(`  ERROR ${inv.invoice_number}: ${error.message}`);
      errors++;
    } else {
      console.log(`  ✓ ${inv.invoice_number}  rid=${rid}  ${currentBalance.toFixed(2)} → ${newBalance.toFixed(2)} (${newStatus})`);
      updated++;
    }
  }

  // 5. Resultado
  console.log();
  console.log("── Resultado final ──────────────────────────────────────");
  console.log({
    total_zero_balance: zeroInvoices.length,
    candidates_matched: candidates.length,
    updated,
    skipped_already_ok: skipped,
    errors,
    no_match_in_payload: noMatch.length,
    filtered_by_client: filteredByClient.length,
  });
  console.log();

  if (updated > 0) {
    console.log(`✓ ${updated} factura(s) restauradas correctamente.`);
    console.log("  Verificar con: node --env-file=.env.local --import tsx scripts/audit-zeta-balance-missing-in-db.mjs");
  }
  if (errors > 0) {
    console.log(`⚠ ${errors} error(es) al actualizar.`);
  }
  if (noMatch.length > 0 && updated > 0) {
    console.log(`  ${noMatch.length} factura(s) sin match en payload — revisar con el script de auditoría.`);
  }

  // 6. CSV de log
  const outDir = resolve(process.cwd(), "temp-audits/output");
  mkdirSync(outDir, { recursive: true });
  const ts = nowIso.replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = resolve(outDir, `backfill-balance-saldos-${ts}.csv`);
  const header = "invoice_number,invoice_id,rid,saldo_payload,balance_antes,status_nuevo,moneda,cliente_codigo,page_id,match_method,resultado\n";
  const rows = [
    ...candidates.map(({ inv, rid, entry, fromNumeroMatch }) => {
      const before = round2(num(inv.balance_amount));
      const result = errors > 0 ? "ver_log" : Math.abs(before - entry.saldo) <= AMOUNT_TOL ? "skip_ok" : DRY_RUN ? "dry_run" : "applied";
      return [inv.invoice_number, inv.id, rid, entry.saldo, before, normalizeStatus(entry.saldo), entry.monedaNombre, entry.clienteCodigo, entry.pageId, fromNumeroMatch ? "numero_fallback" : "registro_id", result];
    }),
    ...noMatch.map(({ inv, rids }) => [inv.invoice_number, inv.id, rids.join("|"), "", round2(num(inv.balance_amount)), "", "", "", "", "no_match"]),
  ];
  const csvBody = rows.map((r) =>
    r.map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
  writeFileSync(csvPath, header + csvBody, "utf8");
  console.log(`  Log CSV: ${csvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
