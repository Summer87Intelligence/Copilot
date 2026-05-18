/**
 * ZETA-17: Seed de workspace_integrations para el workspace actual.
 *
 * Propósito:
 *   Migrar las credenciales Zeta del workspace actual (desde env vars)
 *   a la tabla workspace_integrations en Supabase.
 *
 * Pre-requisitos:
 *   - supabase/zeta-17-01-workspace-integrations.sql aplicado en Supabase.
 *   - .env.local con todas las variables necesarias.
 *   - WORKSPACE_COMPANY_ID o ZETA_WORKSPACE_COMPANY_ID en env.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-zeta-integration-current-workspace.mjs
 *
 * Output:
 *   - Muestra workspace ID y proveedor.
 *   - NO imprime claves ni credenciales.
 *   - Si ya existe una fila para el workspace, actualiza.
 *
 * Seguridad:
 *   - Usa SUPABASE_SERVICE_ROLE_KEY (solo server-side).
 *   - No imprime secretos bajo ninguna circunstancia.
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Leer env
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const workspaceCompanyId = (
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.ZETA_WORKSPACE_COMPANY_ID
)?.trim();

// Credenciales Zeta — leer con fallback A/B
const desarrolladorCodigo =
  process.env.ZETA_DESARROLLADOR_CODIGO?.trim() ||
  process.env.ZETA_DEVELOPER_CODE?.trim();
const desarrolladorClave =
  process.env.ZETA_DESARROLLADOR_CLAVE?.trim() ||
  process.env.ZETA_DEVELOPER_KEY?.trim();
const empresaCodigo =
  process.env.ZETA_EMPRESA_CODIGO?.trim() ||
  process.env.ZETA_COMPANY_CODE?.trim();
const empresaClave =
  process.env.ZETA_EMPRESA_CLAVE?.trim() ||
  process.env.ZETA_COMPANY_KEY?.trim();
const rolCodigo =
  process.env.ZETA_ROL_CODIGO?.trim() ||
  process.env.ZETA_ROLE_CODE?.trim() ||
  "1";

// ---------------------------------------------------------------------------
// Validar
// ---------------------------------------------------------------------------
const errors = [];
if (!supabaseUrl)        errors.push("NEXT_PUBLIC_SUPABASE_URL faltante");
if (!serviceRoleKey)     errors.push("SUPABASE_SERVICE_ROLE_KEY faltante");
if (!workspaceCompanyId) errors.push("WORKSPACE_COMPANY_ID (o ZETA_WORKSPACE_COMPANY_ID) faltante");
if (!desarrolladorCodigo) errors.push("ZETA_DESARROLLADOR_CODIGO | ZETA_DEVELOPER_CODE faltante");
if (!desarrolladorClave)  errors.push("ZETA_DESARROLLADOR_CLAVE | ZETA_DEVELOPER_KEY faltante");
if (!empresaCodigo)       errors.push("ZETA_EMPRESA_CODIGO | ZETA_COMPANY_CODE faltante");
if (!empresaClave)        errors.push("ZETA_EMPRESA_CLAVE | ZETA_COMPANY_KEY faltante");

if (errors.length > 0) {
  console.error("❌ Variables faltantes:");
  errors.forEach((e) => console.error(`   - ${e}`));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Insertar / actualizar
// ---------------------------------------------------------------------------
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

console.log(`\n🔧 seed-zeta-integration-current-workspace`);
console.log(`   workspace_company_id : ${workspaceCompanyId}`);
console.log(`   provider             : zeta`);
console.log(`   empresa_codigo       : ${empresaCodigo}`);
// No imprimir claves

const credentials = {
  desarrolladorCodigo,
  desarrolladorClave,
  empresaCodigo,
  empresaClave,
  rolCodigo,
};

const { error } = await supabase
  .from("workspace_integrations")
  .upsert(
    {
      workspace_company_id: workspaceCompanyId,
      provider: "zeta",
      status: "active",
      credentials,
      metadata: {
        seeded_at: new Date().toISOString(),
        seeded_by: "seed-zeta-integration-current-workspace.mjs",
        empresa_codigo: empresaCodigo,
      },
    },
    { onConflict: "workspace_company_id,provider" }
  );

if (error) {
  console.error(`\n❌ Error al insertar: ${error.message}`);
  process.exit(1);
}

// Verificar sin exponer creds
const { data: row, error: readErr } = await supabase
  .from("workspace_integrations")
  .select("id, workspace_company_id, provider, status, created_at, updated_at, metadata")
  .eq("workspace_company_id", workspaceCompanyId)
  .eq("provider", "zeta")
  .maybeSingle();

if (readErr || !row) {
  console.warn("⚠️  No se pudo verificar la fila insertada.");
} else {
  console.log(`\n✅ workspace_integrations insertado/actualizado:`);
  console.log(`   id         : ${row.id}`);
  console.log(`   status     : ${row.status}`);
  console.log(`   created_at : ${row.created_at}`);
  console.log(`   updated_at : ${row.updated_at}`);
}

console.log(`\nPróximo paso: verificar con loadZetaServerConfigForWorkspace("${workspaceCompanyId}")`);
console.log(`Las credenciales en env vars siguen funcionando como fallback.\n`);
