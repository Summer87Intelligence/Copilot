import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAppUserByEmail } from "@/services/app-user-source";
import type { AppUser } from "@/types/app-user";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

/** Nombres de query/body que intentan fijar el tenant desde el cliente (no son fuente de verdad). */
const TENANT_OVERRIDE_KEYS = [
  "tenant_company_id",
  "workspace_company_id",
  "tenant_id",
  "workspace_id",
] as const;

export type CopilotTenantContext = {
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
  code: "UNAUTHENTICATED" | "FORBIDDEN_TENANT" | "FORBIDDEN_MEMBERSHIP",
  message: string
): NextResponse {
  return NextResponse.json({ ok: false as const, code, message }, { status });
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
 * - 401 sin sesión
 * - 403 sin fila en app_users (sin empresa asignada)
 */
export async function requireCopilotTenantContext(
  request: NextRequest,
  body?: unknown
): Promise<CopilotAuthResult> {
  const supabase = await createRouteSupabaseClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, response: jsonError(401, "UNAUTHENTICATED", "Tenés que iniciar sesión.") };
  }

  const authUser = userData.user;
  const email = authUser.email?.trim();
  if (!email) {
    return {
      ok: false,
      response: jsonError(403, "FORBIDDEN_MEMBERSHIP", "Tu cuenta no tiene email verificado."),
    };
  }

  const appUser = await getAppUserByEmail(email, supabase);
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

  const overrideErr = assertNoTenantOverrideMismatch(request, body ?? null, tenantCompanyId);
  if (overrideErr) {
    return { ok: false, response: overrideErr };
  }

  const protoErr = assertProtoBodyCompanyIdNotWorkspaceUuid(body ?? null, tenantCompanyId);
  if (protoErr) {
    return { ok: false, response: protoErr };
  }

  return {
    ok: true,
    ctx: { supabase, authUser, appUser, tenantCompanyId },
  };
}
