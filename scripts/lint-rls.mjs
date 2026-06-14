#!/usr/bin/env node
/**
 * lint:rls — guardrail estático contra policies RLS permisivas.
 *
 * Read-only. Escanea supabase/*.sql buscando policies que pueden
 * romper el aislamiento por tenant:
 *
 *   1) `USING (true)` / `WITH CHECK (true)` sin filtro de tenant
 *      (excepción explícita en EXEMPT_FILES).
 *   2) `CREATE POLICY ... FOR SELECT ... TO public|anon` con USING que
 *      no menciona `workspace_company_id` ni una función helper conocida.
 *   3) `ALTER TABLE public.* ... DISABLE ROW LEVEL SECURITY`.
 *
 * Salida:
 *   exit 0 → sin hallazgos
 *   exit 1 → policies permisivas detectadas
 *   exit 2 → error de I/O
 *
 * Esto NO sustituye una auditoría live; cubre regresiones a tiempo de commit.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SQL_DIR = path.resolve(process.cwd(), "supabase");

// Helpers que validan tenant en lugar de "true".
const TENANT_HELPERS = [
  "copilot_current_workspace_company_id",
  "auth.uid()",
  "workspace_company_id",
];

// Archivos cuyo USING (true) está justificado y revisado manualmente.
// Toda nueva entrada requiere una línea con motivo y fecha.
const EXEMPT_USING_TRUE = new Map([
  // ej: ["sec02-04-rls-engine-and-documents.sql", "service_role only — 2026-06-13"],
]);

const FINDINGS = [];

function pushFinding(file, line, kind, snippet) {
  FINDINGS.push({ file, line, kind, snippet: snippet.trim().slice(0, 160) });
}

function scanSqlText(file, text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    if (/disable\s+row\s+level\s+security/i.test(line)) {
      pushFinding(file, ln, "rls_disabled", line);
      continue;
    }

    const usingTrue = /USING\s*\(\s*true\s*\)/i.test(line);
    const checkTrue = /WITH\s+CHECK\s*\(\s*true\s*\)/i.test(line);
    if ((usingTrue || checkTrue) && !EXEMPT_USING_TRUE.has(path.basename(file))) {
      pushFinding(file, ln, "permissive_true", line);
      continue;
    }
  }

  // Buscar bloques CREATE POLICY enteros y validar que tengan filtro de tenant.
  const policyRe = /create\s+policy\s+[\s\S]*?;/gi;
  let m;
  while ((m = policyRe.exec(text)) !== null) {
    const block = m[0];
    const startLine = text.slice(0, m.index).split("\n").length;
    const hasTenantFilter = TENANT_HELPERS.some((h) => block.toLowerCase().includes(h.toLowerCase()));
    const targetsPublic = /\bto\s+(public|anon)\b/i.test(block);
    if (targetsPublic && !hasTenantFilter) {
      pushFinding(file, startLine, "policy_to_public_without_tenant", block.split("\n")[0]);
    }
  }
}

async function main() {
  let entries;
  try {
    entries = await readdir(SQL_DIR);
  } catch (err) {
    console.error(`lint:rls — no pude leer ${SQL_DIR}:`, err.message);
    process.exit(2);
  }

  const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

  for (const f of sqlFiles) {
    const full = path.join(SQL_DIR, f);
    let text;
    try {
      text = await readFile(full, "utf8");
    } catch (err) {
      console.error(`lint:rls — skip ${f}: ${err.message}`);
      continue;
    }
    scanSqlText(f, text);
  }

  if (FINDINGS.length === 0) {
    console.log(`lint:rls — OK (escaneados ${sqlFiles.length} archivos).`);
    process.exit(0);
  }

  console.error(`lint:rls — ${FINDINGS.length} finding(s):`);
  for (const f of FINDINGS) {
    console.error(`  · [${f.kind}] ${f.file}:${f.line}`);
    console.error(`      ${f.snippet}`);
  }
  console.error(
    "\nRevisar cada finding. Si es legítimo (ej. service_role only), agregar a EXEMPT_USING_TRUE con motivo y fecha."
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("lint:rls — uncaught:", err);
  process.exit(2);
});
