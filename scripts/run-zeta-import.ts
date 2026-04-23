/**
 * Importación batch Zeta → proto_companies vía POST /api/zeta/import-companies-initial.
 * Requiere app en http://localhost:3000 y cookie de sesión (ver ZETA_IMPORT_COOKIE).
 *
 * Corte: cuando `summary.processed === 0` (Zeta no devolvió filas para esa página).
 * No usar `total_zeta_rows` del JSON como total global: es por request (filas extraídas en esa página).
 */

import fetch from "node-fetch";

const BASE_URL = process.env.ZETA_IMPORT_BASE_URL?.trim() || "http://localhost:3000";
const LIMIT = 20;
const MAX_PAGES = Number(process.env.ZETA_IMPORT_MAX_PAGES) || 20;

function cookieHeader(): Record<string, string> {
  const c = process.env.ZETA_IMPORT_COOKIE?.trim();
  if (!c) return {};
  return { Cookie: c };
}

async function run(): Promise<void> {
  console.log("[Zeta batch import] inicio", { BASE_URL, LIMIT, MAX_PAGES });

  let totalInserted = 0;
  let totalProcessed = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    console.log(`\n[Zeta batch import] página ${page}`);

    const res = await fetch(`${BASE_URL}/api/zeta/import-companies-initial`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(),
      },
      body: JSON.stringify({
        limit: LIMIT,
        page: String(page),
      }),
    });

    const json = (await res.json()) as {
      ok?: boolean;
      summary?: {
        inserted?: number;
        processed?: number;
        total_zeta_rows?: number;
      };
      errors?: string[];
      warnings?: string[];
    };

    console.log("STATUS:", res.status);
    console.log("inserted:", json.summary?.inserted);
    console.log("processed:", json.summary?.processed);
    console.log("total_zeta_rows (esta página):", json.summary?.total_zeta_rows);
    if (json.errors?.length) console.log("errors:", json.errors);
    if (json.warnings?.length) console.log("warnings count:", json.warnings.length);

    if (!res.ok) {
      console.error(
        "[Zeta batch import] respuesta HTTP no OK. Definí ZETA_IMPORT_COOKIE (cookie de sesión del navegador) o revisá auth."
      );
      break;
    }

    totalInserted += json.summary?.inserted ?? 0;
    totalProcessed += json.summary?.processed ?? 0;

    if (!json.summary || json.summary.processed === 0) {
      console.log("[Zeta batch import] sin más datos (processed === 0). Fin.");
      break;
    }
  }

  console.log("\n[Zeta batch import] resultado final");
  console.log("Total inserted:", totalInserted);
  console.log("Total processed:", totalProcessed);
}

run().catch(console.error);
