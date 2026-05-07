#!/usr/bin/env node
/**
 * Piloto de sincronización de recibos de cobranza (`POST /api/zeta/sync-collection-receipts`).
 *
 * Login (PIN) → cookie `copilot_session` → POST sync por mes → reporte JSON.
 *
 * Uso:
 *
 *   COPILOT_USER=<usuario|email>   \
 *   COPILOT_PIN=<pin>              \
 *   node scripts/zeta-pilot-receipts.mjs --mes 1 --anio 2026
 *
 * Variables:
 *  - COPILOT_USER (required) — username o email del PIN auth.
 *  - COPILOT_PIN  (required) — PIN.
 *  - BASE_URL     (default `http://localhost:3000`).
 *  - PAUSE_MS     (default 800ms entre meses si `--meses 1,2,...`).
 *
 * Banderas:
 *  - `--mes <1-12>` y `--anio <YYYY>` para una sola corrida.
 *  - `--meses 1,2,3` para varias corridas secuenciales en el mismo `--anio`.
 *
 * No toca DB directamente: solo usa el endpoint público autenticado.
 */
import process from "node:process";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const COPILOT_USER = process.env.COPILOT_USER?.trim() ?? "";
const COPILOT_PIN = process.env.COPILOT_PIN ?? "";
const PAUSE_MS = Number.parseInt(process.env.PAUSE_MS ?? "800", 10);

if (!COPILOT_USER || !COPILOT_PIN) {
  console.error("Falta COPILOT_USER o COPILOT_PIN. Abortando.");
  process.exit(1);
}

function parseArgs(argv) {
  const args = { mes: null, anio: null, meses: null };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--mes") args.mes = Number.parseInt(v, 10);
    else if (k === "--anio") args.anio = Number.parseInt(v, 10);
    else if (k === "--meses") args.meses = String(v).split(",").map((s) => Number.parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n));
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/copilot/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: COPILOT_USER, pin: COPILOT_PIN }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`login HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }

  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /copilot_session=([^;]+)/.exec(setCookie);
  if (!m) {
    throw new Error(`login OK pero no llegó cookie copilot_session. set-cookie=${setCookie.slice(0, 400)}`);
  }
  return decodeURIComponent(m[1]);
}

async function syncMonth(sessionCookie, mes, anio) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/zeta/sync-collection-receipts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `copilot_session=${encodeURIComponent(sessionCookie)}`,
    },
    body: JSON.stringify({ mes, anio }),
  });

  let json = null;
  let textFallback = "";
  try {
    json = await res.json();
  } catch {
    textFallback = await res.text().catch(() => "");
  }

  return {
    mes,
    anio,
    http_status: res.status,
    elapsed_ms: Date.now() - t0,
    body: json,
    text_fallback_preview: textFallback ? textFallback.slice(0, 1000) : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let mesesToRun = [];
  if (Array.isArray(args.meses) && args.meses.length > 0) {
    mesesToRun = args.meses;
  } else if (Number.isInteger(args.mes)) {
    mesesToRun = [args.mes];
  } else {
    console.error("Indicar --mes <1-12> o --meses 1,2,3 ...");
    process.exit(1);
  }

  if (!Number.isInteger(args.anio)) {
    console.error("Indicar --anio <YYYY>");
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      kind: "zeta_pilot_receipts_start",
      base_url: BASE_URL,
      anio: args.anio,
      meses: mesesToRun,
    })
  );

  let session;
  try {
    session = await login();
    console.log(JSON.stringify({ kind: "zeta_pilot_receipts_login_ok" }));
  } catch (e) {
    console.error(JSON.stringify({ kind: "zeta_pilot_receipts_login_fail", error: e instanceof Error ? e.message : String(e) }));
    process.exit(2);
  }

  const results = [];
  for (let i = 0; i < mesesToRun.length; i += 1) {
    const mes = mesesToRun[i];
    const r = await syncMonth(session, mes, args.anio);
    results.push(r);
    console.log(JSON.stringify({ kind: "zeta_pilot_receipts_month", ...r }));
    if (i < mesesToRun.length - 1 && PAUSE_MS > 0) {
      await sleep(PAUSE_MS);
    }
  }

  console.log(
    JSON.stringify({
      kind: "zeta_pilot_receipts_summary",
      total_runs: results.length,
      ok_runs: results.filter((r) => r.http_status === 200 && r.body?.success === true).length,
      results,
    })
  );
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      kind: "zeta_pilot_receipts_fatal",
      error: e instanceof Error ? e.message : String(e),
    })
  );
  process.exit(1);
});
