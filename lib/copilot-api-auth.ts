import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import {
  getParsedCopilotSessionFromRequest,
} from "@/lib/copilot-session-cookie";
import { applyClearCopilotSessionCookie } from "@/lib/copilot-cookie-options";
import { insertAuthLoginEvent } from "@/lib/security/auth-login-events";
import { getRequestClientMeta } from "@/lib/security/request-client-meta";
import { getAppUserByAuthUid, getAppUserByEmail } from "@/services/app-user-source";
import type { AppUser } from "@/types/app-user";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { isReadOnlyRole } from "@/lib/auth/permissions";

/** Nombres de query/body que intentan fijar el tenant desde el cliente (no son fuente de verdad). */
const TENANT_OVERRIDE_KEYS = [
  "tenant_company_id",
  "workspace_company_id",
  "tenant_id",
  "workspace_id",
] as const;

export type CopilotTenantContext = {
  /**
   * Cliente para consultas a Postgres.
   * - Con **Supabase Auth** (JWT en cookies): cliente SSR con anon key → aplica RLS.
   * - Con solo **`copilot_session`** (PIN): no hay JWT; se usa service role tras validar
   *   `app_users` en servidor. El aislamiento por tenant depende de los filtros de aplicación
   *   (`workspace_company_id`, etc.), no de RLS como `anon`.
   */
  supabase: SupabaseClient;
  authUser: User;
  appUser: AppUser;
  /** UUID de `public.companies` — única fuente de verdad del tenant (desde app_users). */
  tenantCompanyId: string;
};

type AuthFailure = {
  ok: false;
  response: NextResponse;
};

type AuthSuccess = { ok: true; ctx: CopilotTenantContext };

export type CopilotAuthResult = AuthFailure | AuthSuccess;

function jsonError(
  status: 401 | 403,
  code:
    | "UNAUTHENTICATED"
    | "FORBIDDEN_TENANT"
    | "FORBIDDEN_MEMBERSHIP"
    | "SESSION_CREDENTIALS_STALE"
    | "ACCOUNT_INACTIVE",
  message: string,
  options?: { clearCopilotSession?: boolean }
): NextResponse {
  const res = NextResponse.json({ ok: false as const, code, message }, { status });
  if (options?.clearCopilotSession) {
    applyClearCopilotSessionCookie(res);
  }
  return res;
}

function createServiceRoleSupabaseClient(): SupabaseClient | null {
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

function mapRowToAppUser(row: {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}): AppUser {
  return {
    id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
  };
}

/** Mínimo compatible con `User` para rutas que solo exponen `appUser` (sesión cookie). */
function syntheticAuthUserFromAppUser(appUser: AppUser, sessionUserId: string): User {
  return {
    id: sessionUserId,
    aud: "authenticated",
    role: "authenticated",
    email: appUser.email,
    email_confirmed_at: undefined,
    phone: undefined,
    confirmed_at: undefined,
    last_sign_in_at: undefined,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: appUser.created_at,
    updated_at: appUser.created_at,
    is_anonymous: false,
  } as User;
}

function readOverrideTenantFromQuery(request: NextRequest): string | null {
  const sp = request.nextUrl.searchParams;
  for (const key of TENANT_OVERRIDE_KEYS) {
    const v = sp.get(key)?.trim();
    if (v) return v;
  }
  return null;
}

function readOverrideTenantFromBody(body: unknown): string | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  for (const key of TENANT_OVERRIDE_KEYS) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Si el cliente envía un tenant explícito por query o body, debe coincidir con el resuelto server-side.
 */
export function assertNoTenantOverrideMismatch(
  request: NextRequest,
  body: unknown,
  tenantCompanyId: string
): NextResponse | null {
  const fromQuery = readOverrideTenantFromQuery(request);
  if (fromQuery && fromQuery !== tenantCompanyId) {
    return jsonError(
      403,
      "FORBIDDEN_TENANT",
      "No podés operar sobre otro espacio de trabajo."
    );
  }
  const fromBody = readOverrideTenantFromBody(body);
  if (fromBody && fromBody !== tenantCompanyId) {
    return jsonError(
      403,
      "FORBIDDEN_TENANT",
      "No podés operar sobre otro espacio de trabajo."
    );
  }
  return null;
}

/**
 * `company_id` en payloads proto_* referencia `proto_companies.id` (cliente), no `public.companies.id`.
 * Si el cliente envía el mismo campo para suplantar el tenant (coincide UUID con otro tenant), no hay
 * columna de pertenencia en proto_* en este repo: la pertenencia se gobierna por sesión + app_users.
 * Esta función solo bloquea el caso obvio: `company_id` en body igual a un UUID distinto del tenant
 * cuando además existe clave de override (doble señal). Para compatibilidad, la regla útil es:
 * — comparar **solo** claves listadas en TENANT_OVERRIDE_KEYS contra `tenantCompanyId`.
 *
 * Validación explícita opcional: si `body.company_id` === `tenantCompanyId`, es casi seguro un error
 * (mezcla cliente vs workspace). Bloqueamos para evitar escrituras incoherentes.
 */
export function assertProtoBodyCompanyIdNotWorkspaceUuid(
  body: unknown,
  tenantCompanyId: string
): NextResponse | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const cid = o.company_id;
  if (typeof cid !== "string" || !cid.trim()) return null;
  if (cid.trim() === tenantCompanyId) {
    return jsonError(
      403,
      "FORBIDDEN_TENANT",
      "El company_id del cuerpo no puede ser el identificador del workspace. Usá el id de cliente (proto_companies)."
    );
  }
  return null;
}

/**
 * Resuelve sesión + membresía. El tenant es siempre `app_users.company_id` (referencia a public.companies).
 *
 * Orden:
 * 1) Supabase Auth (JWT) + `app_users` por email (comportamiento histórico).
 * 2) Cookie `copilot_session` + `app_users` por id (login usuario/PIN); tenant solo desde DB.
 *
 * - 401 sin sesión reconocida
 * - 403 sin fila en app_users o sin `company_id`
 */
export async function requireCopilotTenantContext(
  request: NextRequest,
  body?: unknown
): Promise<CopilotAuthResult> {
  const supabase = await createRouteSupabaseClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (!userErr && userData.user) {
    const authUser = userData.user;

    // SEC-03: resolver por auth.uid() primero (auth_user_id en app_users),
    // fallback a email para usuarios pre-migración sin auth_user_id poblado.
    let appUser = await getAppUserByAuthUid(authUser.id, supabase);
    if (!appUser) {
      const email = authUser.email?.trim();
      if (email) {
        appUser = await getAppUserByEmail(email, supabase);
      }
    }

    if (!authUser.email?.trim() && !appUser) {
      return {
        ok: false,
        response: jsonError(
          403,
          "FORBIDDEN_MEMBERSHIP",
          "Tu cuenta no tiene email verificado."
        ),
      };
    }

    if (!appUser) {
      return {
        ok: false,
        response: jsonError(
          403,
          "FORBIDDEN_MEMBERSHIP",
          "Tu usuario no está asociado a una empresa en el sistema."
        ),
      };
    }

    const tenantCompanyId = appUser.company_id;
    if (!tenantCompanyId?.trim()) {
      return {
        ok: false,
        response: jsonError(
          403,
          "FORBIDDEN_MEMBERSHIP",
          "Tu usuario no tiene empresa asignada."
        ),
      };
    }

    const overrideErr = assertNoTenantOverrideMismatch(
      request,
      body ?? null,
      tenantCompanyId
    );
    if (overrideErr) {
      return { ok: false, response: overrideErr };
    }

    const protoErr = assertProtoBodyCompanyIdNotWorkspaceUuid(
      body ?? null,
      tenantCompanyId
    );
    if (protoErr) {
      return { ok: false, response: protoErr };
    }

    return {
      ok: true,
      ctx: { supabase, authUser, appUser, tenantCompanyId },
    };
  }

  const parsed = getParsedCopilotSessionFromRequest(request);
  if (!parsed) {
    return {
      ok: false,
      response: jsonError(401, "UNAUTHENTICATED", "Tenés que iniciar sesión."),
    };
  }

  const admin = createServiceRoleSupabaseClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false as const, message: "Error interno del servidor." },
        { status: 500 }
      ),
    };
  }

  const { data: row, error: rowErr } = await admin
    .from("app_users")
    .select("id, company_id, full_name, email, role, created_at, credential_version, is_active, deleted_at")
    .eq("id", parsed.userId)
    .maybeSingle();

  if (rowErr) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false as const, message: "Error interno del servidor." },
        { status: 500 }
      ),
    };
  }

  if (!row) {
    return {
      ok: false,
      response: jsonError(
        403,
        "FORBIDDEN_MEMBERSHIP",
        "Tu usuario no está asociado a una empresa en el sistema."
      ),
    };
  }

  const r = row as {
    id: string;
    company_id: string | null;
    full_name: string;
    email: string;
    role: string;
    created_at: string;
    credential_version?: unknown;
    is_active?: boolean | null;
    deleted_at?: string | null;
  };

  if (r.is_active === false || r.deleted_at) {
    return {
      ok: false,
      response: jsonError(
        403,
        "ACCOUNT_INACTIVE",
        "Tu cuenta está inactiva. Contactá al administrador."
      ),
    };
  }

  const dbCredentialVersion = Math.max(
    1,
    Math.floor(Number(r.credential_version ?? 1)) || 1
  );
  const sessionCredentialVersion = Math.max(1, Math.floor(parsed.credentialVersion ?? 1));

  if (dbCredentialVersion !== sessionCredentialVersion) {
    const meta = getRequestClientMeta(request);
    void insertAuthLoginEvent(admin, {
      userId: r.id,
      companyId: String(r.company_id ?? "").trim() || null,
      success: false,
      failureReason: "session_credentials_stale",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      ok: false,
      response: jsonError(
        401,
        "SESSION_CREDENTIALS_STALE",
        "Sesión expirada. Iniciá sesión de nuevo.",
        { clearCopilotSession: true }
      ),
    };
  }

  const tenantCompanyId = String(r.company_id ?? "").trim();
  if (!tenantCompanyId) {
    return {
      ok: false,
      response: jsonError(
        403,
        "FORBIDDEN_MEMBERSHIP",
        "Tu usuario no tiene empresa asignada."
      ),
    };
  }

  if (
    parsed.companyId != null &&
    parsed.companyId.trim() !== "" &&
    parsed.companyId.trim() !== tenantCompanyId
  ) {
    return {
      ok: false,
      response: jsonError(
        403,
        "FORBIDDEN_TENANT",
        "La sesión no coincide con tu espacio de trabajo."
      ),
    };
  }

  const appUser = mapRowToAppUser({
    id: r.id,
    company_id: tenantCompanyId,
    full_name: r.full_name,
    email: r.email,
    role: r.role,
    created_at: r.created_at,
  });

  const overrideErr = assertNoTenantOverrideMismatch(
    request,
    body ?? null,
    tenantCompanyId
  );
  if (overrideErr) {
    return { ok: false, response: overrideErr };
  }

  const protoErr = assertProtoBodyCompanyIdNotWorkspaceUuid(
    body ?? null,
    tenantCompanyId
  );
  if (protoErr) {
    return { ok: false, response: protoErr };
  }

  const authUser = syntheticAuthUserFromAppUser(appUser, parsed.userId);

  const operational = createServiceRoleSupabaseClient();
  if (!operational) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false as const, message: "Error interno del servidor." },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      supabase: operational,
      authUser,
      appUser,
      tenantCompanyId,
    },
  };
}

/**
 * Idéntico a requireCopilotTenantContext + verifica que el rol permita escritura.
 * Usar en todos los handlers POST/PATCH/PUT/DELETE como defensa en profundidad
 * (el middleware ya bloquea a nivel HTTP, esto bloquea a nivel de aplicación).
 */
export async function requireCopilotWriteContext(
  request: NextRequest,
  body?: unknown
): Promise<CopilotAuthResult> {
  const result = await requireCopilotTenantContext(request, body);
  if (!result.ok) return result;

  if (isReadOnlyRole(result.ctx.appUser.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "READ_ONLY_USER",
          message: "Este usuario es solo lectura. Solo un superadmin puede modificar datos.",
        },
        { status: 403 }
      ),
    };
  }

  return result;
}
