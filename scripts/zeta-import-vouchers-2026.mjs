#!/usr/bin/env node
/**
 * Import mensual controlado de comprobantes/facturas Zeta para 2026.
 * Reutiliza el endpoint existente `POST /api/zeta/import-customer-vouchers-history`
 * con `strategy: single_month` (1 corrida por mes).
 *
 * Requisitos:
 * - Dev/prod app corriendo y accesible por HTTP.
 * - AUTH_TOKEN con sesión válida del tenant (Bearer).
 *
 * Variables:
 * - BASE_URL (default: http://localhost:3000)
 * - AUTH_TOKEN (required)
 * - CLIENTE_CODIGO (optional)
 * - PAUSE_MS (default: 500)
 * - CONTINUE_ON_ERROR (default: true)
 */

const BASE_URL = process.env.BASE_URL?.trim() || "http://localhost:3000";
const AUTH_TOKEN = process.env.AUTH_TOKEN?.trim() || "";
const CLIENTE_CODIGO = process.env.CLIENTE_CODIGO?.trim() || undefined;
const PAUSE_MS = Number.parseInt(process.env.PAUSE_MS || "500", 10);
const CONTINUE_ON_ERROR = (process.env.CONTINUE_ON_ERROR || "true").toLowerCase() !== "false";

if (!AUTH_TOKEN) {
  console.error("Falta AUTH_TOKEN. Abortando.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMonth(mes) {
  const body = {
    strategy: "single_month",
    anio: 2026,
    mes,
    maxPeriods: 1,
    pauseMsBetweenPeriods: 0,
    continueOnError: true,
    ...(CLIENTE_CODIGO ? { clienteCodigo: CLIENTE_CODIGO } : {}),
  };

  const res = await fetch(`${BASE_URL}/api/zeta/import-customer-vouchers-history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { success: false, error: `HTTP ${res.status} sin JSON` };
  }

  const period = Array.isArray(json?.outcomes) && json.outcomes[0] ? json.outcomes[0] : null;
  const out = {
    mes,
    http_status: res.status,
    success: Boolean(json?.success),
    partial: Boolean(json?.partial),
    processed: Number(period?.processed ?? 0),
    inserted: Number(period?.inserted ?? 0),
    updated: Number(period?.updated ?? 0),
    skipped: Number(period?.skipped ?? 0),
    errors: Number(period?.errors ?? 0),
    error_code: period?.error_code ?? json?.error_code ?? null,
    error: period?.error ?? json?.error ?? null,
  };
  return out;
}

async function main() {
  const startedAt = Date.now();
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const results = [];

  console.log(
    JSON.stringify({
      kind: "zeta_import_2026_start",
      base_url: BASE_URL,
      months,
      clienteCodigo: CLIENTE_CODIGO ?? null,
      pause_ms: PAUSE_MS,
      continue_on_error: CONTINUE_ON_ERROR,
    })
  );

  for (const mes of months) {
    const r = await runMonth(mes);
    results.push(r);
    console.log(JSON.stringify({ kind: "zeta_import_2026_month", ...r }));
    if (!r.success && !CONTINUE_ON_ERROR) {
      break;
    }
    if (PAUSE_MS > 0 && mes < 12) {
      await sleep(PAUSE_MS);
    }
  }

  const aggregate = results.reduce(
    (acc, r) => {
      acc.processed += r.processed;
      acc.inserted += r.inserted;
      acc.updated += r.updated;
      acc.skipped += r.skipped;
      acc.errors += r.errors;
      if (!r.success) acc.failed_months.push(r.mes);
      return acc;
    },
    {
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      failed_months: [],
    }
  );

  console.log(
    JSON.stringify({
      kind: "zeta_import_2026_summary",
      duration_ms: Date.now() - startedAt,
      months_executed: results.length,
      aggregate,
      results,
    })
  );

  if (aggregate.failed_months.length > 0 && !CONTINUE_ON_ERROR) {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      kind: "zeta_import_2026_fatal",
      error: e instanceof Error ? e.message : String(e),
    })
  );
  process.exit(1);
});

