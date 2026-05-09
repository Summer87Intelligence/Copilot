/**
 * Backfill de currency_code en proto_invoices con moneda nula.
 *
 * Estrategia por formato de invoice_number:
 *  - ZETA:CCV1:*   → intentar enrichment desde zeta_metadata (serie/numero en metadata)
 *  - ZETA:{RegistroId} → intentar desde zeta_metadata si tiene identity block
 *  - manual/otros  → registrar como no-backfillable
 *
 * USO:
 *   npx tsx scripts/backfill-invoice-currencies.ts [--dry-run] [--workspace-id <id>]
 *
 * FLAGS:
 *   --dry-run          Solo reporta, no escribe en la DB.
 *   --workspace-id     Limitar a un workspace específico (obligatorio en producción).
 *   --limit            Máx. invoices a procesar (default: 500).
 */

import { createClient } from "@supabase/supabase-js";
import { normalizeZetaCurrency } from "../lib/integrations/zeta/zeta-currency-normalize";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const WORKSPACE_ID = (() => {
  const idx = args.indexOf("--workspace-id");
  return idx >= 0 ? (args[idx + 1] ?? null) : null;
})();
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx >= 0 ? parseInt(args[idx + 1] ?? "500", 10) : 500;
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v !== null && v !== undefined) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

type InvoiceRow = {
  id: string;
  invoice_number: string;
  zeta_metadata: unknown;
  workspace_company_id: string | null;
  currency_code: string | null;
};

type BackfillOutcome =
  | { kind: "skipped_has_currency"; existing: string }
  | { kind: "inferred"; currency: string; source: string }
  | { kind: "not_backfillable"; reason: string };

function inferCurrencyFromMetadata(meta: unknown): { currency: string; source: string } | null {
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;

  // Buscar en identity block
  for (const key of ["zeta_comprobante_identity_v1", "zeta_customer_voucher_v1"]) {
    const block = m[key];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const b = block as Record<string, unknown>;
    const monedaNombre = readStr(b, "MonedaNombre", "monedaNombre", "moneda_nombre");
    const monedaSimbolo = readStr(b, "MonedaSimbolo", "monedaSimbolo", "moneda_simbolo");
    const monedaCodigo = readStr(b, "MonedaCodigo", "monedaCodigo", "moneda_codigo");
    const iso = normalizeZetaCurrency(monedaNombre, monedaSimbolo, monedaCodigo);
    if (iso) return { currency: iso, source: key };
  }

  // Buscar en zeta_currency_enrichment
  const enrichment = m.zeta_currency_enrichment;
  if (enrichment && typeof enrichment === "object" && !Array.isArray(enrichment)) {
    const e = enrichment as Record<string, unknown>;
    const iso = normalizeZetaCurrency(
      readStr(e, "moneda_nombre"),
      readStr(e, "moneda_simbolo"),
      readStr(e, "moneda_codigo")
    );
    if (iso) return { currency: iso, source: "zeta_currency_enrichment" };
  }

  return null;
}

function classifyInvoice(row: InvoiceRow): BackfillOutcome {
  if (row.currency_code) {
    return { kind: "skipped_has_currency", existing: row.currency_code };
  }

  // Intentar desde metadata
  const inferred = inferCurrencyFromMetadata(row.zeta_metadata);
  if (inferred) {
    return { kind: "inferred", currency: inferred.currency, source: inferred.source };
  }

  // No tiene metadata útil
  const num = row.invoice_number;
  if (num.startsWith("ZETA:CCV1:")) {
    return { kind: "not_backfillable", reason: "ccv1_sin_metadata_moneda" };
  }
  if (num.startsWith("ZETA:")) {
    return { kind: "not_backfillable", reason: "legacy_registro_id_sin_metadata" };
  }
  return { kind: "not_backfillable", reason: "formato_desconocido" };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "backfill_currencies",
      kind: "start",
      dry_run: DRY_RUN,
      workspace_id: WORKSPACE_ID,
      limit: LIMIT,
    })
  );

  // 1. Cargar invoices con currency_code null
  let query = supabase
    .from("proto_invoices")
    .select("id, invoice_number, zeta_metadata, workspace_company_id, currency_code")
    .is("currency_code", null)
    .eq("is_active", true)
    .limit(LIMIT);

  if (WORKSPACE_ID) {
    query = query.eq("workspace_company_id", WORKSPACE_ID);
  }

  const { data, error } = await query;
  if (error) {
    console.error("ERROR al cargar invoices:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as InvoiceRow[];
  console.log(`\nInvoices con currency_code null: ${rows.length}`);

  // 2. Clasificar y procesar
  let updatedCount = 0;
  let skippedHasCurrency = 0;
  let notBackfillable = 0;
  let errorsCount = 0;
  const currencyDistribution: Record<string, number> = {};
  const reasonDistribution: Record<string, number> = {};

  for (const row of rows) {
    const outcome = classifyInvoice(row);

    if (outcome.kind === "skipped_has_currency") {
      skippedHasCurrency++;
      continue;
    }

    if (outcome.kind === "not_backfillable") {
      notBackfillable++;
      reasonDistribution[outcome.reason] = (reasonDistribution[outcome.reason] ?? 0) + 1;
      continue;
    }

    // kind === "inferred"
    const { currency, source } = outcome;
    currencyDistribution[currency] = (currencyDistribution[currency] ?? 0) + 1;

    if (DRY_RUN) {
      console.log(
        JSON.stringify({
          source: "backfill_currencies",
          kind: "dry_run_would_update",
          id: row.id,
          invoice_number: row.invoice_number,
          currency,
          inference_source: source,
          workspace_company_id: row.workspace_company_id,
        })
      );
      updatedCount++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("proto_invoices")
      .update({ currency_code: currency })
      .eq("id", row.id);

    if (upErr) {
      console.error(
        JSON.stringify({
          source: "backfill_currencies",
          kind: "update_error",
          id: row.id,
          invoice_number: row.invoice_number,
          error: upErr.message,
        })
      );
      errorsCount++;
    } else {
      console.log(
        JSON.stringify({
          source: "backfill_currencies",
          kind: "updated",
          id: row.id,
          invoice_number: row.invoice_number,
          currency,
          inference_source: source,
        })
      );
      updatedCount++;
    }
  }

  // 3. Resumen
  const summary = {
    timestamp: new Date().toISOString(),
    source: "backfill_currencies",
    kind: "summary",
    dry_run: DRY_RUN,
    total_null_currency: rows.length,
    updated: updatedCount,
    skipped_already_had_currency: skippedHasCurrency,
    not_backfillable: notBackfillable,
    errors: errorsCount,
    currency_distribution: currencyDistribution,
    not_backfillable_reasons: reasonDistribution,
  };

  console.log("\n" + JSON.stringify(summary, null, 2));

  if (notBackfillable > 0) {
    console.log(`
⚠ ${notBackfillable} invoices no pudieron inferirse desde metadata.
  Opciones:
  1. Re-correr sync de saldos (agrega currency_code desde Zeta en el próximo sync).
  2. Correr enrichment de moneda por período para completar ZETA:CCV1:* faltantes.
  3. Revisar si esas facturas tienen MonedaNombre en QuerySaldosPendientes y actualizar manualmente.
`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
