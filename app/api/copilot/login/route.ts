import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getCopilotSessionCookieSetOptions } from "@/lib/copilot-cookie-options";
import {
  COPILOT_SESSION_COOKIE,
  serializeCopilotSessionValue,
} from "@/lib/copilot-session-cookie";
import { CopilotSessionSigningSecretMissingError } from "@/lib/copilot-session-signing";
import {
  insertAuthLoginEvent,
  logAuthStructured,
} from "@/lib/security/auth-login-events";
import {
  checkLoginRateLimit,
  resolveLoginRateLimitMaxIp,
  resolveLoginRateLimitMaxUser,
  resolveLoginRateLimitWindowMs,
} from "@/lib/security/login-rate-limit";
import {
  hashPin,
  safeEqualPlaintextPin,
  verifyPinAgainstHash,
} from "@/lib/security/pin-hash";
import { getRequestClientMeta } from "@/lib/security/request-client-meta";
import { loginBlockReason } from "@/lib/auth/app-user-lifecycle";
import { getDefaultLandingForUser } from "@/lib/auth/default-landing";
import { getDefaultPermissionsForRole } from "@/lib/auth/role-permission-presets";
import {
  resolveEffectivePermissions,
  type AccessLevel,
  type ModuleKey,
} from "@/lib/auth/module-permissions";

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

type AppUserLoginRow = {
  id: string;
  company_id: string;
  username: string | null;
  pin: string | null;
  pin_hash: string | null;
  role: string;
  credential_version: number | null;
  failed_login_count: number | null;
  locked_until: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
};

/** Valor literal para `ilike` (sin %): igualdad insensible a mayúsculas; escapa comodines LIKE. */
function ilikeExactPattern(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, '""');
  return `"${escaped}"`;
}

let cachedDummyPinHash: string | null = null;

async function getDummyPinHash(): Promise<string> {
  if (cachedDummyPinHash) return cachedDummyPinHash;
  cachedDummyPinHash = await hashPin("__COPILOT_LOGIN_TIMING_DUMMY_V1__");
  return cachedDummyPinHash;
}

async function burnArgon2Compare(pin: string): Promise<void> {
  const dummy = await getDummyPinHash();
  await verifyPinAgainstHash(pin, dummy);
}

function resolveLoginMaxFailures(): number {
  const raw = process.env.LOGIN_MAX_FAILURES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n >= 3 ? n : 8;
}

function resolveLoginLockMinutes(): number {
  const raw = process.env.LOGIN_LOCK_MINUTES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? n : 15;
}

function generic401(): NextResponse {
  return NextResponse.json(
    { ok: false as const, error: "Credenciales inválidas." },
    { status: 401 }
  );
}

function generic429(): NextResponse {
  return NextResponse.json(
    { ok: false as const, error: "Demasiados intentos. Probá más tarde." },
    { status: 429 }
  );
}

function generic500(): NextResponse {
  return NextResponse.json(
    { ok: false as const, error: "Error interno del servidor" },
    { status: 500 }
  );
}

/**
 * POST /api/copilot/login
 * SECURITY-02: hash Argon2id dual-read, rate limit, lockout, auditoría, cookie TTL + secure condicional.
 */
export async function POST(request: Request) {
  const { ip, userAgent } = getRequestClientMeta(request);
  const nowMs = Date.now();
  const windowMs = resolveLoginRateLimitWindowMs();
  const maxIp = resolveLoginRateLimitMaxIp();
  const maxUser = resolveLoginRateLimitMaxUser();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return generic500();
    }

    if (body == null || typeof body !== "object") {
      return generic401();
    }

    const o = body as Record<string, unknown>;
    const user = String(o.user ?? "").trim();
    const pin = String(o.pin ?? "");

    if (!user || !pin) {
      return generic401();
    }

    const ipKey = `ip:${ip ?? "unknown"}`;
    const userKey = `user:${user.toLowerCase()}`;
    const rlIp = checkLoginRateLimit(ipKey, nowMs, { windowMs, maxAttempts: maxIp });
    const rlUser = checkLoginRateLimit(userKey, nowMs, { windowMs, maxAttempts: maxUser });
    if (!rlIp.allowed || !rlUser.allowed) {
      logAuthStructured("login_rate_limited", {
        ip: ip ?? null,
        user_key: userKey,
        ip_allowed: rlIp.allowed,
        user_allowed: rlUser.allowed,
      });
      const adminRl = createServiceRoleClient();
      if (adminRl) {
        void insertAuthLoginEvent(adminRl, {
          userId: null,
          companyId: null,
          success: false,
          failureReason: "rate_limited",
          ip,
          userAgent,
        });
      }
      return generic429();
    }

    const admin = createServiceRoleClient();
    if (!admin) {
      return generic500();
    }

    const p = ilikeExactPattern(user);
    const { data: row, error } = await admin
      .from("app_users")
      .select(
        "id, company_id, username, pin, pin_hash, role, credential_version, failed_login_count, locked_until, is_active, deleted_at"
      )
      .or(`username.ilike.${p},email.ilike.${p}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      logAuthStructured("login_db_error", { message: error.message });
      return generic500();
    }

    const u = row as AppUserLoginRow | null;

    if (!u || typeof u.company_id !== "string" || !u.company_id.trim()) {
      await burnArgon2Compare(pin);
      void insertAuthLoginEvent(admin, {
        userId: null,
        companyId: null,
        success: false,
        failureReason: "invalid_credentials",
        ip,
        userAgent,
      });
      return generic401();
    }

    const lockedUntil = u.locked_until ? Date.parse(u.locked_until) : Number.NaN;
    if (Number.isFinite(lockedUntil) && lockedUntil > nowMs) {
      void insertAuthLoginEvent(admin, {
        userId: u.id,
        companyId: u.company_id,
        success: false,
        failureReason: "account_locked",
        ip,
        userAgent,
      });
      logAuthStructured("login_locked", { user_id: u.id, company_id: u.company_id });
      return NextResponse.json(
        { ok: false as const, error: "Cuenta temporalmente bloqueada. Probá más tarde." },
        { status: 403 }
      );
    }

    const pinHash =
      typeof u.pin_hash === "string" && u.pin_hash.trim()
        ? u.pin_hash.trim()
        : null;
    const legacyPin =
      typeof u.pin === "string" && u.pin.length > 0 ? u.pin : null;

    let pinOk = false;
    if (pinHash) {
      pinOk = await verifyPinAgainstHash(pin, pinHash);
      if (!pinOk) {
        await burnArgon2Compare(pin);
      }
    } else if (legacyPin != null) {
      pinOk = safeEqualPlaintextPin(legacyPin, pin);
      if (!pinOk) {
        await burnArgon2Compare(pin);
      }
    } else {
      await burnArgon2Compare(pin);
    }

    if (!pinOk) {
      const fails = Math.max(0, Number(u.failed_login_count ?? 0));
      const nextFails = fails + 1;
      const maxFails = resolveLoginMaxFailures();
      const lockMs = resolveLoginLockMinutes() * 60_000;
      const lockedUntilIso =
        nextFails >= maxFails
          ? new Date(nowMs + lockMs).toISOString()
          : (u.locked_until ?? null);

      await admin
        .from("app_users")
        .update({
          failed_login_count: nextFails,
          locked_until: lockedUntilIso,
        })
        .eq("id", u.id);

      void insertAuthLoginEvent(admin, {
        userId: u.id,
        companyId: u.company_id,
        success: false,
        failureReason: "invalid_credentials",
        ip,
        userAgent,
      });
      return generic401();
    }

    const accessBlock = loginBlockReason({
      is_active: u.is_active,
      deleted_at: u.deleted_at ?? null,
    });
    if (accessBlock) {
      void insertAuthLoginEvent(admin, {
        userId: u.id,
        companyId: u.company_id,
        success: false,
        failureReason: u.deleted_at ? "account_deleted" : "account_inactive",
        ip,
        userAgent,
      });
      return NextResponse.json(
        { ok: false as const, error: accessBlock },
        { status: 403 }
      );
    }

    const credentialVersion = Math.max(
      1,
      Math.floor(Number(u.credential_version ?? 1)) || 1
    );

    const updates: Record<string, unknown> = {
      failed_login_count: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    };

    if (!pinHash && legacyPin != null) {
      try {
        updates.pin_hash = await hashPin(pin);
        updates.credentials_updated_at = new Date().toISOString();
      } catch (e) {
        logAuthStructured("pin_hash_migration_error", {
          user_id: u.id,
          error: String(e),
        });
      }
    }

    const { error: updErr } = await admin.from("app_users").update(updates).eq("id", u.id);
    if (updErr) {
      logAuthStructured("login_post_success_update_error", {
        user_id: u.id,
        message: updErr.message,
      });
      return generic500();
    }

    const role = String(u.role ?? "").trim() || "user";
    const companyId = u.company_id.trim();
    let cookieValue: string;
    try {
      cookieValue = serializeCopilotSessionValue(
        u.id,
        role,
        companyId,
        credentialVersion
      );
    } catch (e) {
      if (e instanceof CopilotSessionSigningSecretMissingError) {
        logAuthStructured("login_signing_secret_missing", { user_id: u.id });
        return NextResponse.json(
          { ok: false as const, message: "Error de configuración del servidor." },
          { status: 500 }
        );
      }
      throw e;
    }

    void insertAuthLoginEvent(admin, {
      userId: u.id,
      companyId,
      success: true,
      failureReason: null,
      ip,
      userAgent,
    });

    logAuthStructured("login_success", {
      user_id: u.id,
      company_id: companyId,
      pin_migrated_to_hash: Boolean(!pinHash && legacyPin != null && updates.pin_hash),
    });

    // USER-ACCESS-LANDING-PERMISSIONS-001: resolver el destino post-login
    // server-side (rol + permisos efectivos) para que el cliente navegue
    // directo, sin flash de Hoy antes del redirect real.
    const presetFallback = Object.fromEntries(
      getDefaultPermissionsForRole(role).map((p) => [p.moduleKey, p.accessLevel])
    );
    let landing = getDefaultLandingForUser(role, presetFallback);
    try {
      const { data: overrideRows } = await admin
        .from("app_user_permissions")
        .select("module_key, access_level")
        .eq("workspace_id", companyId)
        .eq("user_id", u.id);
      const presets = getDefaultPermissionsForRole(role);
      const overrides = ((overrideRows ?? []) as Array<{ module_key: string; access_level: string }>)
        .filter((row) => typeof row.module_key === "string" && typeof row.access_level === "string")
        .map((row) => ({ moduleKey: row.module_key as ModuleKey, accessLevel: row.access_level as AccessLevel }));
      const effective = resolveEffectivePermissions(role, presets, overrides);
      const modulePermissions = Object.fromEntries(
        effective.map((p) => [p.moduleKey, p.accessLevel])
      );
      landing = getDefaultLandingForUser(role, modulePermissions);
    } catch (e) {
      logAuthStructured("login_landing_resolution_error", { user_id: u.id, error: String(e) });
    }

    const res = NextResponse.json({ ok: true as const, landing });
    res.cookies.set(COPILOT_SESSION_COOKIE, cookieValue, getCopilotSessionCookieSetOptions());
    return res;
  } catch (e) {
    logAuthStructured("login_unhandled_error", { error: String(e) });
    return generic500();
  }
}
