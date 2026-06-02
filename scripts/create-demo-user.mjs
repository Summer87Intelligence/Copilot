/**
 * Crea o actualiza el usuario demo de solo lectura.
 *
 * Uso:
 *   node scripts/create-demo-user.mjs
 *
 * Variables de entorno requeridas (leer de .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DEMO_WORKSPACE_ID  (opcional; si no se provee, usa la primera company disponible)
 *
 * El script es idempotente: si el usuario ya existe, actualiza rol/password.
 * No borra nada.
 *
 * Schema app_users NOT NULL: id, company_id, full_name, email, role,
 * created_at, credential_version, failed_login_count.
 * id es propio (gen_random_uuid()), auth_user_id es nullable.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ── Cargar .env.local manualmente (sin dotenv) ────────────────────────────────
function loadEnvLocal() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local puede no existir en CI
  }
}

loadEnvLocal();

// ── Config ────────────────────────────────────────────────────────────────────
const DEMO_EMAIL = "usuariodemo@gmail.com";
const DEMO_PASSWORD = "1234";
const DEMO_ROLE = "demo_readonly";
const DEMO_USERNAME = "usuariodemo";
const DEMO_FULL_NAME = "Usuario Demo";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function resolveWorkspaceId() {
  const fromEnv = process.env.DEMO_WORKSPACE_ID?.trim();
  if (fromEnv) return fromEnv;

  const { data, error } = await admin.from("companies").select("id, name").limit(1).maybeSingle();
  if (error || !data) {
    console.error("❌ No se pudo resolver workspace. Definí DEMO_WORKSPACE_ID en .env.local.");
    process.exit(1);
  }
  console.log(`ℹ️  Usando workspace: ${data.name ?? data.id} (${data.id})`);
  return data.id;
}

async function upsertAuthUser() {
  // Buscar usuario existente por email en auth.users
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users?.find((u) => u.email === DEMO_EMAIL);

  if (existing) {
    console.log(`ℹ️  Auth user ya existe (${existing.id}). Actualizando password…`);
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      // Si falla por política de password, continuar — el login usa PIN propio
      console.warn(`⚠️  No se pudo actualizar password en Supabase Auth: ${error.message}`);
      console.warn("   (El login de Copilot usa PIN propio, esto no bloquea el acceso.)");
    }
    return existing.id;
  }

  console.log("ℹ️  Creando auth user…");
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });

  if (error || !data?.user) {
    if (error?.message?.toLowerCase().includes("password")) {
      console.warn(
        `⚠️  Supabase Auth rechazó el password '${DEMO_PASSWORD}': ${error?.message}`,
        "\n   El login de Copilot usa PIN propio — el auth user es opcional.",
        "\n   Continuando sin auth user de Supabase."
      );
    } else {
      console.warn(`⚠️  No se pudo crear auth user: ${error?.message}. Continuando…`);
    }
    return null;
  }

  return data.user.id;
}

async function upsertAppUser(authUserId, companyId) {
  // Buscar por email (UNIQUE en app_users)
  const { data: existing, error: fetchErr } = await admin
    .from("app_users")
    .select("id, role, pin")
    .eq("email", DEMO_EMAIL)
    .maybeSingle();

  if (fetchErr) {
    console.error("❌ Error al buscar en app_users:", fetchErr.message);
    process.exit(1);
  }

  if (existing) {
    console.log(`ℹ️  app_users ya existe (id: ${existing.id}). Actualizando…`);
    const updates = {
      role: DEMO_ROLE,
      company_id: companyId,
      username: DEMO_USERNAME,
      full_name: DEMO_FULL_NAME,
      pin: DEMO_PASSWORD,
      pin_hash: null,           // Forzar re-hash en próximo login
      credential_version: 1,
      failed_login_count: 0,
      locked_until: null,
    };
    if (authUserId) updates.auth_user_id = authUserId;

    const { error } = await admin
      .from("app_users")
      .update(updates)
      .eq("id", existing.id);

    if (error) {
      console.error("❌ Error al actualizar app_users:", error.message);
      process.exit(1);
    }
    return existing.id;
  }

  console.log("ℹ️  Insertando fila en app_users…");
  const row = {
    company_id: companyId,
    full_name: DEMO_FULL_NAME,
    email: DEMO_EMAIL,
    role: DEMO_ROLE,
    username: DEMO_USERNAME,
    pin: DEMO_PASSWORD,
    pin_hash: null,
    credential_version: 1,
    failed_login_count: 0,
    locked_until: null,
  };
  if (authUserId) row.auth_user_id = authUserId;

  const { data: inserted, error } = await admin
    .from("app_users")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("❌ Error al insertar app_users:", error.message);
    process.exit(1);
  }
  return inserted.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("🚀 create-demo-user: iniciando…");

  const companyId = await resolveWorkspaceId();
  const authUserId = await upsertAuthUser();
  const appUserId = await upsertAppUser(authUserId, companyId);

  console.log("");
  console.log("✅ Usuario demo creado/actualizado:");
  console.log("   app_users.id :", appUserId);
  console.log("   Email        :", DEMO_EMAIL);
  console.log("   Username     :", DEMO_USERNAME);
  console.log("   PIN          :", DEMO_PASSWORD);
  console.log("   Rol          :", DEMO_ROLE);
  console.log("   Workspace    :", companyId);
  console.log("");
  console.log("   Para login: /login → usuario: usuariodemo → PIN: 1234");
  console.log("   (O email: usuariodemo@gmail.com)");
})();
