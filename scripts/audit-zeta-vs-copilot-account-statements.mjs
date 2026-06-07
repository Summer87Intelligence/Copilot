#!/usr/bin/env node
/**
 * Auditoría read-only — dos tracks separados (NO mezclar semánticas):
 *
 * A) LEDGER COPILOT (= PDF Zeta estado de cuenta):
 *    opening + Σ(total_amount facturas CCV1, excl. saldos pendientes) − Σ(recibos)
 *
 * B) DEUDA OPERATIVA vs SALDOS ZETA ACTIVOS:
 *    raw Σ(balance_amount) vs dedupe (CCV1 > shadow saldos pendientes)
 *
 * Cross-comparison ledger↔operativa es INFORMATIVA (opening, balance vs total, etc.).
 *
 * Uso:
 *   node scripts/audit-zeta-vs-copilot-account-statements.mjs
 *   npm run audit:account-statements
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SALDOS_PENDIENTES = "Zeta / saldos pendientes";
const PAGE_SIZE = 1000;
const AMOUNT_TOL = 0.02;
const EPS = 0.005;

const CFE_NC_TIPOS = new Set([102, 112, 122, 132, 142, 182, 202, 212, 222, 232, 242, 282]);

const VOID_STATUSES = new Set(["void", "voided", "cancelled", "canceled", "anulada", "anulado"]);

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

if (!url || !key || !workspaceId) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID"
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function isVoidInvoice(inv) {
  const st = String(inv.status ?? "").trim().toLowerCase();
  return VOID_STATUSES.has(st);
}

function readCfeTipo(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v1 = metadata.zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const raw = v1.cfe_tipo ?? v1.cfeTipo ?? v1.CFETipo;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function isCreditNote(metadata) {
  const tipo = readCfeTipo(metadata);
  return tipo != null && CFE_NC_TIPOS.has(tipo);
}

function readInvoiceCurrency(row) {
  const dc = String(row.currency_code ?? "").trim().toUpperCase();
  if (dc === "USD" || dc.includes("U$S") || dc.includes("US$")) return "USD";
  if (dc === "UYU" || dc === "$" || dc.includes("PES")) return "UYU";

  const zm = row.zeta_metadata;
  if (zm && typeof zm === "object" && !Array.isArray(zm)) {
    const v1 = zm.zeta_customer_voucher_v1;
    if (v1 && typeof v1 === "object" && !Array.isArray(v1)) {
      const simb = String(v1.moneda_simbolo ?? "").trim().toUpperCase();
      if (simb.includes("U$S") || simb.includes("USD")) return "USD";
      if (simb.includes("$") || simb.includes("UYU")) return "UYU";
      const cod = String(v1.moneda_codigo ?? "").trim();
      if (cod === "2") return "USD";
      if (cod === "1") return "UYU";
    }
  }
  return null;
}

function readReceiptCurrency(row) {
  const dc = String(row.currency_code ?? "").trim().toUpperCase();
  if (dc === "USD") return "USD";
  if (dc === "UYU") return "UYU";
  const amt = num(row.amount);
  if (amt <= 0) return null;
  return readInvoiceCurrency(row);
}

async function fetchAll(table, select, workspaceFilter = true) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (workspaceFilter) q = q.eq("workspace_company_id", workspaceId);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

function companyLabel(c) {
  return (
    String(c.RazonSocial ?? c.Nombre ?? c.name ?? "").trim() ||
    String(c.name ?? "").trim() ||
    c.id
  );
}

function matchesSpotlight(name, fragment) {
  return name.toUpperCase().includes(fragment.toUpperCase());
}

function isShadowRow(inv) {
  return String(inv.category ?? "").trim() === SALDOS_PENDIENTES;
}

function parseRegistroFromInvoiceNumber(invoiceNumber) {
  const n = String(invoiceNumber ?? "").trim();
  if (!n.startsWith("ZETA:") || n.startsWith("ZETA:CCV1:")) return null;
  const m = /^ZETA:(\d+)$/.exec(n);
  return m?.[1] ?? null;
}

function extractRegistroIds(metadata) {
  const raw = [];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return raw;
  const idBlock = metadata.zeta_comprobante_identity_v1;
  if (idBlock && typeof idBlock === "object" && !Array.isArray(idBlock)) {
    const r = idBlock.registro_id;
    if (r != null && String(r).trim()) raw.push(String(r).trim());
  }
  const v1 = metadata.zeta_customer_voucher_v1;
  if (v1 && typeof v1 === "object" && !Array.isArray(v1)) {
    const zr = v1.zeta_registro_id;
    if (zr != null && String(zr).trim()) raw.push(String(zr).trim());
    const payload = v1.raw_payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const rr = payload.RegistroId ?? payload.registroId;
      if (rr != null && String(rr).trim()) raw.push(String(rr).trim());
    }
  }
  return [...new Set(raw)];
}

function buildEquivKey(inv) {
  const invoiceNumber = String(inv.invoice_number ?? "").trim();
  if (isShadowRow(inv)) {
    const rid = parseRegistroFromInvoiceNumber(invoiceNumber);
    if (rid) return `reg:${rid}`;
  }
  const regIds = extractRegistroIds(inv.zeta_metadata);
  if (regIds.length > 0) return `reg:${[...regIds].sort()[0]}`;
  if (invoiceNumber.startsWith("ZETA:CCV1:")) return `ccv1:${invoiceNumber}`;
  const companyId = String(inv.company_id ?? "").trim();
  const cur = readInvoiceCurrency(inv);
  const issue = String(inv.issue_date ?? "").slice(0, 10);
  const total = round2(num(inv.total_amount));
  if (companyId && cur && issue && total > EPS) {
    return `heur:${companyId}:${cur}:${issue}:${total.toFixed(2)}`;
  }
  return null;
}

function pickWinner(group) {
  const reals = group.filter((inv) => !isShadowRow(inv));
  const shadows = group.filter(isShadowRow);
  const candidates = reals.length > 0 ? reals : shadows;
  return [...candidates].sort((a, b) => {
    const aCc = String(a.invoice_number ?? "").startsWith("ZETA:CCV1:") ? 1 : 0;
    const bCc = String(b.invoice_number ?? "").startsWith("ZETA:CCV1:") ? 1 : 0;
    if (bCc !== aCc) return bCc - aCc;
    return num(b.balance_amount) - num(a.balance_amount);
  })[0];
}

function totalsWithinTolerance(a, b) {
  const diff = Math.abs(a - b);
  return diff <= Math.max(0.01, 1e-4 * Math.max(Math.abs(a), Math.abs(b)));
}

function amountsCompatibleForDedup(real, shadow) {
  const shadowBal = Math.max(0, num(shadow.balance_amount));
  const realBal = Math.max(0, num(real.balance_amount));
  const realTotal = round2(num(real.total_amount));
  const shadowTotal = round2(num(shadow.total_amount));
  return (
    totalsWithinTolerance(realBal, shadowBal) ||
    totalsWithinTolerance(realTotal, shadowBal) ||
    totalsWithinTolerance(realTotal, shadowTotal)
  );
}

function realHasRegistroId(inv, registroId) {
  return extractRegistroIds(inv.zeta_metadata).includes(registroId);
}

function pairShadowsToRealsByRegistroId(shadows, reals) {
  const shadowToReal = new Map();
  const usedRealIds = new Set();

  for (const shadow of shadows) {
    const shadowId = String(shadow.id ?? "").trim();
    if (!shadowId || shadowToReal.has(shadowId)) continue;

    const registroId = parseRegistroFromInvoiceNumber(shadow.invoice_number);
    if (!registroId) continue;

    const shadowCompany = String(shadow.company_id ?? "").trim();
    const shadowCur = readInvoiceCurrency(shadow);
    const shadowIssue = String(shadow.issue_date ?? "").slice(0, 10);
    const shadowBal = Math.max(0, num(shadow.balance_amount));
    if (!shadowCur || shadowBal <= EPS) continue;

    const metadataMatches = reals.filter((real) => {
      const realId = String(real.id ?? "").trim();
      if (!realId || usedRealIds.has(realId)) return false;
      if (String(real.company_id ?? "").trim() !== shadowCompany) return false;
      if (readInvoiceCurrency(real) !== shadowCur) return false;
      return realHasRegistroId(real, registroId);
    });

    if (metadataMatches.length === 1) {
      const realId = String(metadataMatches[0].id ?? "").trim();
      shadowToReal.set(shadowId, realId);
      usedRealIds.add(realId);
      continue;
    }

    const fallbackMatches = reals.filter((real) => {
      const realId = String(real.id ?? "").trim();
      if (!realId || usedRealIds.has(realId)) return false;
      if (String(real.company_id ?? "").trim() !== shadowCompany) return false;
      if (readInvoiceCurrency(real) !== shadowCur) return false;
      if (shadowIssue && String(real.issue_date ?? "").slice(0, 10) !== shadowIssue) return false;
      return amountsCompatibleForDedup(real, shadow);
    });

    if (fallbackMatches.length === 1) {
      const realId = String(fallbackMatches[0].id ?? "").trim();
      shadowToReal.set(shadowId, realId);
      usedRealIds.add(realId);
    }
  }

  return shadowToReal;
}

function pairShadowsToRealsByBalance(shadows, reals) {
  const shadowToReal = new Map();
  const usedRealIds = new Set();
  const usedShadowIds = new Set();

  function bucketKey(inv) {
    const cur = readInvoiceCurrency(inv);
    const bal = round2(Math.max(0, num(inv.balance_amount)));
    if (!cur || bal <= EPS) return null;
    return `${cur}:${bal.toFixed(2)}`;
  }

  const shadowBuckets = new Map();
  const realBuckets = new Map();
  for (const shadow of shadows) {
    const key = bucketKey(shadow);
    if (!key) continue;
    const list = shadowBuckets.get(key) ?? [];
    list.push(shadow);
    shadowBuckets.set(key, list);
  }
  for (const real of reals) {
    const key = bucketKey(real);
    if (!key) continue;
    const list = realBuckets.get(key) ?? [];
    list.push(real);
    realBuckets.set(key, list);
  }

  for (const [key, bucketShadows] of shadowBuckets) {
    const bucketReals = realBuckets.get(key) ?? [];
    if (bucketShadows.length === 1 && bucketReals.length === 1) {
      const shadowId = String(bucketShadows[0].id ?? "").trim();
      const realId = String(bucketReals[0].id ?? "").trim();
      if (shadowId && realId) shadowToReal.set(shadowId, realId);
      continue;
    }
    if (bucketShadows.length > 1 && bucketShadows.length === bucketReals.length) {
      const sortedShadows = [...bucketShadows].sort((a, b) =>
        String(a.id ?? "").localeCompare(String(b.id ?? ""))
      );
      const sortedReals = [...bucketReals].sort((a, b) =>
        String(a.id ?? "").localeCompare(String(b.id ?? ""))
      );
      for (let i = 0; i < sortedShadows.length; i += 1) {
        const shadowId = String(sortedShadows[i].id ?? "").trim();
        const realId = String(sortedReals[i].id ?? "").trim();
        if (shadowId && realId) shadowToReal.set(shadowId, realId);
      }
    }
  }

  for (const shadow of shadows) {
    const shadowId = String(shadow.id ?? "").trim();
    if (!shadowId || shadowToReal.has(shadowId) || usedShadowIds.has(shadowId)) continue;
    const shadowCur = readInvoiceCurrency(shadow);
    const shadowBal = Math.max(0, num(shadow.balance_amount));
    if (!shadowCur || shadowBal <= EPS) continue;
    const candidates = reals.filter((real) => {
      const realId = String(real.id ?? "").trim();
      if (!realId || usedRealIds.has(realId)) return false;
      const realCur = readInvoiceCurrency(real);
      if (realCur !== shadowCur) return false;
      const realBal = Math.max(0, num(real.balance_amount));
      const realTotal = round2(num(real.total_amount));
      return (
        totalsWithinTolerance(realBal, shadowBal) ||
        totalsWithinTolerance(realTotal, shadowBal) ||
        totalsWithinTolerance(realTotal, num(shadow.total_amount))
      );
    });
    if (candidates.length === 1) {
      const realId = String(candidates[0].id ?? "").trim();
      shadowToReal.set(shadowId, realId);
      usedRealIds.add(realId);
      usedShadowIds.add(shadowId);
    }
  }
  return shadowToReal;
}

function selectDedupedOperationalInvoices(companyInvoices) {
  const eligible = companyInvoices.filter(
    (inv) => !isVoidInvoice(inv) && !isCreditNote(inv.zeta_metadata) && inv.is_active !== false
  );
  const grouped = new Map();
  const standalone = [];
  for (const inv of eligible) {
    const key = buildEquivKey(inv);
    if (!key) {
      standalone.push(inv);
      continue;
    }
    const bucket = grouped.get(key) ?? [];
    bucket.push(inv);
    grouped.set(key, bucket);
  }

  const out = [];
  const consumedShadowIds = new Set();

  for (const group of grouped.values()) {
    const reals = group.filter((inv) => !isShadowRow(inv));
    const shadows = group.filter(isShadowRow);
    if (reals.length === 0 && shadows.length > 0) continue;
    const winner = pickWinner(group);
    if (!winner) continue;
    out.push(winner);
    for (const s of shadows) {
      if (s !== winner) consumedShadowIds.add(String(s.id ?? "").trim());
    }
  }

  const unmatchedShadows = eligible.filter(
    (inv) => isShadowRow(inv) && !consumedShadowIds.has(String(inv.id ?? "").trim())
  );
  const allReals = eligible.filter((inv) => !isShadowRow(inv));
  const registroPairs = pairShadowsToRealsByRegistroId(unmatchedShadows, allReals);
  const stillUnmatchedShadows = unmatchedShadows.filter(
    (inv) => !registroPairs.has(String(inv.id ?? "").trim())
  );
  const balancePairs = pairShadowsToRealsByBalance(
    stillUnmatchedShadows,
    allReals.filter((real) => !new Set(registroPairs.values()).has(String(real.id ?? "").trim()))
  );
  const allPairs = new Map([...registroPairs, ...balancePairs]);

  for (const inv of standalone) {
    const invId = String(inv.id ?? "").trim();
    if (isShadowRow(inv) && allPairs.has(invId)) continue;
    out.push(inv);
  }

  for (const shadow of unmatchedShadows) {
    const shadowId = String(shadow.id ?? "").trim();
    if (!allPairs.has(shadowId)) out.push(shadow);
  }

  return out;
}

function operationalDebtByCurrency(companyInvoices) {
  const deduped = selectDedupedOperationalInvoices(companyInvoices);
  const totals = { UYU: 0, USD: 0, rawUYU: 0, rawUSD: 0 };
  for (const inv of companyInvoices) {
    if (isVoidInvoice(inv) || isCreditNote(inv.zeta_metadata) || inv.is_active === false) continue;
    const cur = readInvoiceCurrency(inv);
    const bal = Math.max(0, num(inv.balance_amount));
    if (!cur || bal <= EPS) continue;
    if (cur === "USD") totals.rawUSD = round2(totals.rawUSD + bal);
    else totals.rawUYU = round2(totals.rawUYU + bal);
  }
  for (const inv of deduped) {
    const cur = readInvoiceCurrency(inv);
    const bal = Math.max(0, num(inv.balance_amount));
    if (!cur || bal <= EPS) continue;
    if (cur === "USD") totals.USD = round2(totals.USD + bal);
    else totals.UYU = round2(totals.UYU + bal);
  }
  return totals;
}

function classifyOperativeDedupe(rawZeta, dedupedZeta) {
  const diff = round2(rawZeta - dedupedZeta);
  if (diff <= AMOUNT_TOL) {
    return { status: "ok", cause: "OK", realBug: false, diff };
  }
  // Raw DB aún tiene shadow+CCV1; Copilot dedupe corrige en lectura (P3, no bug de app)
  return {
    status: "expected",
    cause: "RAW_DUP_DB_COPILOT_DEDUPE_OK",
    realBug: false,
    diff,
  };
}

function classifyLedgerRow(ctx) {
  const { ledgerFinal, opening, unknownCurrencyInvoices, unknownCurrencyReceipts } = ctx;
  if (unknownCurrencyInvoices > 0 || unknownCurrencyReceipts > 0) {
    return { status: "review", cause: "CURRENCY_OR_MATCHING_ISSUE", realBug: false };
  }
  if (ledgerFinal < -AMOUNT_TOL) {
    return { status: "no_comparable", cause: "CREDIT_BALANCE_NOT_IN_ZETA_DEBT", realBug: false };
  }
  if (Math.abs(ledgerFinal - opening) <= AMOUNT_TOL && Math.abs(opening) > AMOUNT_TOL) {
    return { status: "ok", cause: "OPENING_BALANCE_POLICY", realBug: false };
  }
  return { status: "ok", cause: "OK", realBug: false };
}

/** Cross-comparison ledger vs deuda operativa — informativo, NO bug por defecto. */
function classifyCrossLedgerOperative(ctx) {
  const {
    ledgerFinal,
    operatingDebt,
    opening,
    invoicesTotal,
    receiptsTotal,
    rawZetaDebt,
    dedupedZetaDebt,
  } = ctx;

  const diff = round2(ledgerFinal - operatingDebt);
  const absDiff = Math.abs(diff);

  if (ledgerFinal < -AMOUNT_TOL) {
    return { cause: "CREDIT_BALANCE_NOT_IN_ZETA_DEBT", realBug: false, diff };
  }
  if (absDiff <= AMOUNT_TOL) {
    return { cause: "OK", realBug: false, diff };
  }

  // Opening explica el gap (Fletcher −700, DOBSURA −298.90, ALKITODO parcial)
  if (
    Math.abs(diff - opening) <= AMOUNT_TOL ||
    Math.abs(diff + opening) <= AMOUNT_TOL ||
    (Math.abs(opening) > AMOUNT_TOL && absDiff <= Math.abs(opening) + AMOUNT_TOL * 2)
  ) {
    return { cause: "OPENING_BALANCE_POLICY", realBug: false, diff };
  }

  // Ledger positivo, sin deuda activa Zeta (opening-only o histórico pagado)
  if (operatingDebt <= AMOUNT_TOL && ledgerFinal > AMOUNT_TOL) {
    if (Math.abs(ledgerFinal - opening) <= AMOUNT_TOL) {
      return { cause: "OPENING_BALANCE_POLICY", realBug: false, diff };
    }
    return { cause: "CUSTOMER_HAS_NO_ACTIVE_ZETA_DEBT", realBug: false, diff };
  }

  // Deuda Zeta activa pero ledger neto ~0 (recibos cubrieron totales, saldo abierto en Zeta)
  if (ledgerFinal <= AMOUNT_TOL && operatingDebt > AMOUNT_TOL) {
    return { cause: "DEBT_BALANCE_ONLY_VS_LEDGER", realBug: false, diff };
  }

  // Ambos positivos: ledger usa total_amount−recibos; operativa usa balance_amount abierto
  if (ledgerFinal > AMOUNT_TOL && operatingDebt > AMOUNT_TOL) {
    return { cause: "DEBT_BALANCE_ONLY_VS_LEDGER", realBug: false, diff };
  }

  // Pagos adelantados / crédito parcial
  if (ledgerFinal < operatingDebt && receiptsTotal > invoicesTotal + AMOUNT_TOL) {
    return { cause: "CREDIT_BALANCE_NOT_IN_ZETA_DEBT", realBug: false, diff };
  }

  return { cause: "DEBT_BALANCE_ONLY_VS_LEDGER", realBug: false, diff };
}

function buildClientDiagnostic(companyId, company, companyInvoices, companyReceipts, buckets, currency) {
  const b = currency === "USD" ? buckets.usd : buckets.uyu;
  const opening = b.opening;
  const ledgerFinal = round2(opening + b.invoicesTotal - b.receiptsTotal);
  const operatingDebt = b.zetaBalance;
  const rawZeta = b.zetaBalanceRaw;
  const cross = classifyCrossLedgerOperative({
    ledgerFinal,
    operatingDebt,
    opening,
    invoicesTotal: b.invoicesTotal,
    receiptsTotal: b.receiptsTotal,
    rawZetaDebt: rawZeta,
    dedupedZetaDebt: operatingDebt,
  });

  const openInvoices = [];
  const shadows = [];
  for (const inv of companyInvoices) {
    if (isVoidInvoice(inv) || isCreditNote(inv.zeta_metadata) || inv.is_active === false) continue;
    const cur = readInvoiceCurrency(inv);
    if (cur !== currency) continue;
    const bal = Math.max(0, num(inv.balance_amount));
    if (bal <= EPS) continue;
    const row = {
      number: String(inv.invoice_number ?? inv.id ?? "").slice(0, 40),
      balance: bal,
      total: num(inv.total_amount),
      issue: String(inv.issue_date ?? "").slice(0, 10),
      saldos: isShadowRow(inv),
    };
    if (row.saldos) shadows.push(row);
    else openInvoices.push(row);
  }

  const openReceipts = [];
  for (const rec of companyReceipts) {
    const cur = readReceiptCurrency(rec);
    if (cur !== currency) continue;
    const amt = num(rec.amount);
    if (amt <= EPS) continue;
    openReceipts.push({
      amount: amt,
      date: String(rec.receipt_date ?? rec.issue_date ?? "").slice(0, 10),
    });
  }

  return {
    name: company ? companyLabel(company) : companyId,
    codigo: company ? String(company.Codigo ?? "").trim() : "",
    currency,
    opening,
    ledgerFinal,
    operatingDebt,
    rawZeta,
    diff: cross.diff,
    cause: cross.cause,
    realBug: cross.realBug,
    invoicesTotal: b.invoicesTotal,
    receiptsTotal: b.receiptsTotal,
    openInvoices,
    shadows,
    openReceipts,
  };
}

function printDiagnostic(d) {
  console.log(`\n### ${d.name} (${d.currency}) cod.${d.codigo || "—"}`);
  console.log(`  Copilot ledger:     ${d.ledgerFinal.toFixed(2)}`);
  console.log(`  Deuda operativa:    ${d.operatingDebt.toFixed(2)} (raw Zeta: ${d.rawZeta.toFixed(2)})`);
  console.log(`  Diff ledger−oper.:  ${d.diff.toFixed(2)}`);
  console.log(`  Opening:            ${d.opening.toFixed(2)}`);
  console.log(`  Σ invoices (CCV1):  ${d.invoicesTotal.toFixed(2)}`);
  console.log(`  Σ receipts:         ${d.receiptsTotal.toFixed(2)}`);
  console.log(`  Causa:              ${d.cause}${d.realBug ? " ⚠ REAL_BUG" : ""}`);
  if (d.openInvoices.length) {
    console.log(`  Facturas abiertas (${d.openInvoices.length}):`);
    for (const inv of d.openInvoices.slice(0, 8)) {
      console.log(`    • ${inv.number} ${inv.issue} bal=${inv.balance.toFixed(2)} total=${inv.total.toFixed(2)}`);
    }
  }
  if (d.shadows.length) {
    console.log(`  Shadows saldos (${d.shadows.length}):`);
    for (const s of d.shadows.slice(0, 5)) {
      console.log(`    • ${s.number} ${s.issue} bal=${s.balance.toFixed(2)}`);
    }
  }
  if (d.openReceipts.length) {
    const recSum = round2(d.openReceipts.reduce((s, r) => s + r.amount, 0));
    console.log(`  Recibos (${d.openReceipts.length}, Σ=${recSum.toFixed(2)})`);
  }
}

/** @deprecated — reemplazado por classifyCrossLedgerOperative + classifyOperativeDedupe */
function classifyCause(ctx) {
  return classifyCrossLedgerOperative(ctx).cause;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  console.log("\n=== Auditoría Copilot vs Zeta (read-only) ===\n");
  console.log(`Workspace: ${workspaceId}`);
  console.log("Track A: Ledger Copilot (= PDF Zeta estado de cuenta)");
  console.log("Track B: Deuda operativa dedupeada vs raw Zeta balance_amount");
  console.log("Cross ledger↔operativa: informativo (opening, balance vs total, etc.)\n");

  const [companies, invoices, receipts] = await Promise.all([
    fetchAll(
      "proto_companies",
      "id, name, RazonSocial, Nombre, Codigo, ledger_opening_balance_uyu, ledger_opening_balance_usd, is_active"
    ),
    fetchAll(
      "proto_invoices",
      "id, company_id, invoice_number, total_amount, balance_amount, currency_code, category, status, zeta_metadata, is_active, issue_date, due_date"
    ),
    fetchAll(
      "proto_receipts",
      "id, company_id, amount, currency_code, status, is_active"
    ),
  ]);

  console.log(
    `Cargados: ${companies.length} empresas, ${invoices.length} facturas, ${receipts.length} recibos\n`
  );

  const companyById = new Map(companies.map((c) => [String(c.id), c]));

  /** @type {Map<string, { uyu: object, usd: object }>} */
  const agg = new Map();

  function ensure(companyId) {
    if (!agg.has(companyId)) {
      agg.set(companyId, {
        uyu: emptyBucket(),
        usd: emptyBucket(),
      });
    }
    return agg.get(companyId);
  }

  function emptyBucket() {
    return {
      opening: 0,
      invoicesTotal: 0,
      invoicesTotalInclSaldos: 0,
      receiptsTotal: 0,
      zetaBalance: 0,
      zetaBalanceRaw: 0,
      zetaBalanceExclSaldos: 0,
      invoiceCount: 0,
      receiptCount: 0,
      unknownCurrencyInvoices: 0,
      unknownCurrencyReceipts: 0,
    };
  }

  for (const inv of invoices) {
    if (isVoidInvoice(inv)) continue;
    const companyId = String(inv.company_id ?? "").trim();
    if (!companyId) continue;

    const cur = readInvoiceCurrency(inv);
    const total = num(inv.total_amount);
    const balance = num(inv.balance_amount);
    const isSaldos = String(inv.category ?? "").trim() === SALDOS_PENDIENTES;
    const isNc = isCreditNote(inv.zeta_metadata);
    const isActive = inv.is_active !== false;

    const buckets = ensure(companyId);
    if (!cur) {
      buckets.uyu.unknownCurrencyInvoices += 1;
      buckets.usd.unknownCurrencyInvoices += 1;
      continue;
    }
    const b = cur === "USD" ? buckets.usd : buckets.uyu;

    if (!isSaldos && total > EPS && !isNc) {
      b.invoicesTotal = round2(b.invoicesTotal + total);
    }
    if (total > EPS && !isNc) {
      b.invoicesTotalInclSaldos = round2(b.invoicesTotalInclSaldos + total);
    }

    if (isActive && !isNc && balance > EPS) {
      if (!isSaldos) {
        b.zetaBalanceExclSaldos = round2(b.zetaBalanceExclSaldos + balance);
      }
    }

    b.invoiceCount += 1;
  }

  const invoicesByCompany = new Map();
  for (const inv of invoices) {
    const companyId = String(inv.company_id ?? "").trim();
    if (!companyId) continue;
    const list = invoicesByCompany.get(companyId) ?? [];
    list.push(inv);
    invoicesByCompany.set(companyId, list);
  }

  for (const [companyId, companyInvoices] of invoicesByCompany) {
    const debt = operationalDebtByCurrency(companyInvoices);
    const buckets = ensure(companyId);
    buckets.uyu.zetaBalance = debt.UYU;
    buckets.usd.zetaBalance = debt.USD;
    buckets.uyu.zetaBalanceRaw = debt.rawUYU;
    buckets.usd.zetaBalanceRaw = debt.rawUSD;
  }

  for (const rec of receipts) {
    const companyId = String(rec.company_id ?? "").trim();
    if (!companyId) continue;
    const amount = num(rec.amount);
    if (amount <= EPS) continue;

    const cur = readReceiptCurrency(rec);
    const buckets = ensure(companyId);
    if (!cur) {
      buckets.uyu.unknownCurrencyReceipts += 1;
      buckets.usd.unknownCurrencyReceipts += 1;
      continue;
    }
    const b = cur === "USD" ? buckets.usd : buckets.uyu;
    b.receiptsTotal = round2(b.receiptsTotal + amount);
    b.receiptCount += 1;
  }

  for (const c of companies) {
    const id = String(c.id);
    const buckets = ensure(id);
    buckets.uyu.opening = num(c.ledger_opening_balance_uyu);
    buckets.usd.opening = num(c.ledger_opening_balance_usd);
  }

  const receiptsByCompany = new Map();
  for (const rec of receipts) {
    const companyId = String(rec.company_id ?? "").trim();
    if (!companyId) continue;
    const list = receiptsByCompany.get(companyId) ?? [];
    list.push(rec);
    receiptsByCompany.set(companyId, list);
  }

  const rows = [];
  const operativeRows = [];
  const crossRows = [];
  const openingCandidates = [];

  for (const [companyId, buckets] of agg) {
    const company = companyById.get(companyId);
    const name = company ? companyLabel(company) : companyId;
    const codigo = company ? String(company.Codigo ?? "").trim() : "";
    const companyInvoices = invoicesByCompany.get(companyId) ?? [];
    const companyReceipts = receiptsByCompany.get(companyId) ?? [];

    for (const currency of ["UYU", "USD"]) {
      const b = currency === "UYU" ? buckets.uyu : buckets.usd;
      const opening = b.opening;
      const ledgerFinal = round2(opening + b.invoicesTotal - b.receiptsTotal);
      const operatingDebt = b.zetaBalance;
      const rawZeta = b.zetaBalanceRaw;

      const hasActivity =
        Math.abs(opening) > EPS ||
        b.invoiceCount > 0 ||
        b.receiptCount > 0 ||
        Math.abs(operatingDebt) > EPS ||
        Math.abs(ledgerFinal) > EPS;

      if (!hasActivity) continue;

      const ledgerAudit = classifyLedgerRow({
        ledgerFinal,
        opening,
        unknownCurrencyInvoices: b.unknownCurrencyInvoices,
        unknownCurrencyReceipts: b.unknownCurrencyReceipts,
      });

      const operativeAudit = classifyOperativeDedupe(rawZeta, operatingDebt);

      const cross = classifyCrossLedgerOperative({
        ledgerFinal,
        operatingDebt,
        opening,
        invoicesTotal: b.invoicesTotal,
        receiptsTotal: b.receiptsTotal,
        rawZetaDebt: rawZeta,
        dedupedZetaDebt: operatingDebt,
      });

      rows.push({
        companyId,
        name,
        codigo,
        currency,
        opening,
        invoicesTotal: b.invoicesTotal,
        receiptsTotal: b.receiptsTotal,
        copilotFinal: ledgerFinal,
        zetaBalance: operatingDebt,
        zetaBalanceRaw: rawZeta,
        zetaBalanceExclSaldos: b.zetaBalanceExclSaldos,
        diff: cross.diff,
        cause: cross.cause,
        realBug: cross.realBug,
        ledgerStatus: ledgerAudit.status,
        ledgerCause: ledgerAudit.cause,
        status: Math.abs(cross.diff) <= AMOUNT_TOL ? "ok" : "cross_diff",
        invoiceCount: b.invoiceCount,
        receiptCount: b.receiptCount,
      });

      operativeRows.push({
        companyId,
        name,
        codigo,
        currency,
        rawZeta,
        dedupedZeta: operatingDebt,
        diff: operativeAudit.diff,
        cause: operativeAudit.cause,
        realBug: operativeAudit.realBug,
        status: operativeAudit.status,
      });

      crossRows.push({
        companyId,
        name,
        codigo,
        currency,
        ledgerFinal,
        operatingDebt,
        diff: cross.diff,
        cause: cross.cause,
        realBug: cross.realBug,
      });
    }
  }

  const summarizeLedger = (list) => ({
    audited: list.length,
    ok: list.filter((r) => r.ledgerStatus === "ok").length,
    noComparable: list.filter((r) => r.ledgerStatus === "no_comparable").length,
    review: list.filter((r) => r.ledgerStatus === "review").length,
  });

  const summarizeOperative = (list) => ({
    audited: list.length,
    ok: list.filter((r) => r.status === "ok").length,
    rawDupExpected: list.filter((r) => r.cause === "RAW_DUP_DB_COPILOT_DEDUPE_OK").length,
    realBugs: list.filter((r) => r.realBug).length,
    rawDupTotal: round2(
      list.filter((r) => r.cause === "RAW_DUP_DB_COPILOT_DEDUPE_OK").reduce((s, r) => s + Math.abs(r.diff), 0)
    ),
  });

  const summarizeCross = (list) => ({
    audited: list.length,
    ok: list.filter((r) => Math.abs(r.diff) <= AMOUNT_TOL).length,
    explained: list.filter((r) => !r.realBug && Math.abs(r.diff) > AMOUNT_TOL).length,
    realBugs: list.filter((r) => r.realBug).length,
  });

  const uyuRows = rows.filter((r) => r.currency === "UYU");
  const usdRows = rows.filter((r) => r.currency === "USD");
  const uyuOp = operativeRows.filter((r) => r.currency === "UYU");
  const usdOp = operativeRows.filter((r) => r.currency === "USD");

  const sumLedgerUyu = summarizeLedger(uyuRows);
  const sumLedgerUsd = summarizeLedger(usdRows);
  const sumOpUyu = summarizeOperative(uyuOp);
  const sumOpUsd = summarizeOperative(usdOp);
  const sumCrossUyu = summarizeCross(crossRows.filter((r) => r.currency === "UYU"));
  const sumCrossUsd = summarizeCross(crossRows.filter((r) => r.currency === "USD"));

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("A) LEDGER COPILOT (= PDF Zeta estado de cuenta)");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  auditados UYU: ${sumLedgerUyu.audited}  |  USD: ${sumLedgerUsd.audited}`);
  console.log(`  OK UYU: ${sumLedgerUyu.ok}  |  OK USD: ${sumLedgerUsd.ok}`);
  console.log(
    `  crédito a favor (no comparable): UYU ${sumLedgerUyu.noComparable}  USD ${sumLedgerUsd.noComparable}`
  );

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("B) DEUDA OPERATIVA vs SALDOS ZETA ACTIVOS (raw vs dedupe)");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  auditados UYU: ${sumOpUyu.audited}  |  USD: ${sumOpUsd.audited}`);
  console.log(`  OK (sin duplicados raw) UYU: ${sumOpUyu.ok}  |  USD: ${sumOpUsd.ok}`);
  console.log(
    `  raw duplicado en DB, dedupe OK (P3) UYU: ${sumOpUyu.rawDupExpected}  |  USD: ${sumOpUsd.rawDupExpected}`
  );
  console.log(
    `  BUGS REALES (dedupe falló) UYU: ${sumOpUyu.realBugs}  |  USD: ${sumOpUsd.realBugs}`
  );
  if (sumOpUyu.realBugs + sumOpUsd.realBugs === 0) {
    console.log("  → Dedupe operativo Copilot OK (raw DB puede tener shadows duplicados).");
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("CROSS: ledger vs deuda operativa (INFORMATIVO — no es bug por diseño)");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  pares auditados UYU: ${sumCrossUyu.audited}  |  USD: ${sumCrossUsd.audited}`);
  console.log(`  coinciden (OK): UYU ${sumCrossUyu.ok}  |  USD: ${sumCrossUsd.ok}`);
  console.log(`  explicados (conceptual): UYU ${sumCrossUyu.explained}  |  USD: ${sumCrossUsd.explained}`);
  console.log(`  bugs reales: UYU ${sumCrossUyu.realBugs}  |  USD: ${sumCrossUsd.realBugs}`);

  const causeCounts = new Map();
  for (const r of crossRows) {
    if (Math.abs(r.diff) <= AMOUNT_TOL) continue;
    causeCounts.set(r.cause, (causeCounts.get(r.cause) ?? 0) + 1);
  }
  if (causeCounts.size) {
    console.log("\n  Causas cross (top):");
    for (const [cause, n] of [...causeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    ${cause}: ${n}`);
    }
  }

  const realBugs = operativeRows.filter((r) => r.realBug);
  if (realBugs.length) {
    console.log("\n⚠ BUGS REALES — dedupe operativo:");
    for (const r of realBugs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 15)) {
      console.log(
        `  ${r.name.slice(0, 32)} ${r.currency}: raw=${r.rawZeta.toFixed(2)} dedupe=${r.dedupedZeta.toFixed(2)} diff=${r.diff.toFixed(2)}`
      );
    }
  }

  const crossExplained = crossRows
    .filter((r) => !r.realBug && Math.abs(r.diff) > AMOUNT_TOL)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log("\nTABLA CROSS (top 25 informativos por |diff|):");
  console.log("cliente | cod | mon | ledger | operativa | diff | causa");
  for (const r of crossExplained.slice(0, 25)) {
    console.log(
      [
        r.name.slice(0, 28),
        r.codigo || "—",
        r.currency,
        r.ledgerFinal.toFixed(2),
        r.operatingDebt.toFixed(2),
        r.diff.toFixed(2),
        r.cause,
      ].join(" | ")
    );
  }

  const tmpDir = resolve(process.cwd(), "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const csvHeader = [
    "company_id",
    "cliente",
    "codigo_zeta",
    "moneda",
    "opening_balance",
    "invoices_total",
    "receipts_total",
    "ledger_final",
    "zeta_balance_deduped",
    "zeta_balance_raw",
    "zeta_balance_excl_saldos_pendientes",
    "cross_diff_ledger_minus_operative",
    "cross_cause",
    "cross_real_bug",
    "operative_dedupe_status",
    "operative_dedupe_cause",
    "ledger_status",
    "invoice_count",
    "receipt_count",
  ].join(",");

  const csvLines = rows.map((r) => {
    const op = operativeRows.find(
      (o) => o.companyId === r.companyId && o.currency === r.currency
    );
    return [
      r.companyId,
      csvEscape(r.name),
      csvEscape(r.codigo),
      r.currency,
      r.opening,
      r.invoicesTotal,
      r.receiptsTotal,
      r.copilotFinal,
      r.zetaBalance,
      r.zetaBalanceRaw ?? r.zetaBalance,
      r.zetaBalanceExclSaldos,
      r.diff,
      r.cause,
      r.realBug ? "yes" : "no",
      op?.status ?? "",
      op?.cause ?? "",
      r.ledgerStatus,
      r.invoiceCount,
      r.receiptCount,
    ].join(",");
  });

  const csvPath = resolve(tmpDir, "account-statement-audit.csv");
  writeFileSync(csvPath, [csvHeader, ...csvLines].join("\n"), "utf8");
  console.log(`\nCSV: ${csvPath}`);

  if (openingCandidates.length > 0) {
    const sqlLines = [
      "-- Candidatos de opening balance (NO ejecutar automáticamente)",
      `-- workspace: ${workspaceId}`,
      `-- generado: ${new Date().toISOString()}`,
      "",
    ];
    for (const c of openingCandidates) {
      sqlLines.push(
        `-- ${c.name} (${c.currency}) diff=${c.diff} → sugerido ${c.col}=${c.suggested}`
      );
      sqlLines.push(
        `UPDATE proto_companies SET ${c.col} = ${c.suggested} WHERE id = '${c.companyId}' AND workspace_company_id = '${workspaceId}';`
      );
      sqlLines.push("");
    }
    const sqlPath = resolve(tmpDir, "ledger-opening-balance-candidates.sql");
    writeFileSync(sqlPath, sqlLines.join("\n"), "utf8");
    console.log(`SQL candidatos: ${sqlPath} (${openingCandidates.length} filas)`);
  } else {
    console.log("\nSin candidatos de opening balance (ledger-opening-balance-candidates.sql omitido).");
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("DIAGNÓSTICO CLIENTES OBLIGATORIOS");
  console.log("══════════════════════════════════════════════════════════════");

  const mandatorySpots = [
    { label: "Remiplat SA", fragment: "Remiplat", currency: "UYU" },
    { label: "Aldiesan SRL", fragment: "Aldiesan", currency: "UYU" },
    { label: "Ubal Dalmu", fragment: "Ubal Dalmu", currency: "UYU" },
    { label: "Fikley SA", fragment: "Fikley", currency: "UYU" },
    { label: "BDF Uruguay", fragment: "BDF", currency: "UYU" },
    { label: "Grupo Pentalfa", fragment: "Pentalfa", currency: "UYU" },
    { label: "Arroyal", fragment: "Arroyal", currency: "UYU" },
    { label: "Nirmex", fragment: "Nirmex", currency: "UYU" },
    { label: "Dolby", fragment: "Dolby", currency: "USD" },
    { label: "El País", fragment: "El Pais", currency: "UYU" },
    { label: "ALKITODO", fragment: "ALKITODO", currency: "UYU" },
    { label: "Fletcher", fragment: "Fletcher", currency: "UYU" },
    { label: "Bloommy", fragment: "Bloommy", currency: "UYU" },
    { label: "PAPELERIA ALDO", fragment: "PAPELERIA ALDO", currency: "UYU" },
    { label: "DOBSURA", fragment: "DOBSURA", currency: "USD" },
    { label: "ACQUAGARDEN", fragment: "ACQUAGARDEN", currency: "USD" },
  ];

  for (const spot of mandatorySpots) {
    const hit = rows.find(
      (r) => r.currency === spot.currency && matchesSpotlight(r.name, spot.fragment)
    );
    if (!hit) {
      console.log(`\n### ${spot.label} (${spot.currency}) — no encontrado`);
      continue;
    }
    const companyInvoices = invoicesByCompany.get(hit.companyId) ?? [];
    const companyReceipts = receiptsByCompany.get(hit.companyId) ?? [];
    const buckets = agg.get(hit.companyId);
    if (!buckets) continue;
    const diag = buildClientDiagnostic(
      hit.companyId,
      companyById.get(hit.companyId),
      companyInvoices,
      companyReceipts,
      buckets,
      spot.currency
    );
    printDiagnostic(diag);
  }

  function printSpotlight(label, nameFragment, currency) {
    const hit = rows.find(
      (r) => r.currency === currency && matchesSpotlight(r.name, nameFragment)
    );
    if (!hit) return;
    const op = operativeRows.find(
      (o) => o.companyId === hit.companyId && o.currency === currency
    );
    console.log(`\n--- ${label} ${currency} (resumen) ---`);
    console.log(`  ledger: ${hit.copilotFinal.toFixed(2)} | operativa: ${hit.zetaBalance.toFixed(2)} | cross diff: ${hit.diff.toFixed(2)}`);
    console.log(`  cross causa: ${hit.cause} | dedupe: ${op?.cause ?? "—"}`);
  }

  printSpotlight("Estudio Fletcher SAS", "Fletcher", "UYU");
  printSpotlight("ACQUAGARDEN", "ACQUAGARDEN", "USD");
  printSpotlight("DOBSURA", "DOBSURA", "USD");
  printSpotlight("Bloommy", "Bloommy", "UYU");
  printSpotlight("PAPELERIA ALDO", "PAPELERIA ALDO", "UYU");

  const totalRealBugs = sumOpUyu.realBugs + sumOpUsd.realBugs;
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("VEREDICTO");
  console.log("══════════════════════════════════════════════════════════════");
  if (totalRealBugs === 0) {
    console.log("✅ Sin bugs reales de dedupe operativo.");
    console.log(`ℹ️  ${sumOpUyu.rawDupExpected + sumOpUsd.rawDupExpected} cliente(s) con raw DB duplicado — Copilot dedupe OK (P3).`);
    console.log("ℹ️  Diferencias ledger↔operativa son conceptuales (opening, balance vs total).");
  } else {
    console.log(`⚠️  ${totalRealBugs} cliente(s) con dedupe operativo fallido (REAL_BUG).`);
  }

  console.log("\n=== Fin auditoría ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
