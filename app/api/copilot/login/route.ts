import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  COPILOT_SESSION_COOKIE,
  serializeCopilotSessionValue,
} from "@/lib/copilot-session-cookie";

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

type AppUserRow = {
  id: string;
  username: string | null;
  pin: string | null;
  role: string;
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

/**
 * POST /api/copilot/login
 * Valida `user` (username o email) + `pin` en `public.app_users` (service role; sin Supabase Auth).
 */
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Error interno del servidor" },
        { status: 500 }
      );
    }

    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const o = body as Record<string, unknown>;
    const user = String(o.user ?? "").trim();
    const pin = String(o.pin ?? "");

    if (!user || !pin) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const admin = createServiceRoleClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Error interno del servidor" },
        { status: 500 }
      );
    }

    const p = ilikeExactPattern(user);
    const { data: row, error } = await admin
      .from("app_users")
      .select("id, username, pin, role")
      .or(`username.ilike.${p},email.ilike.${p}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Error interno del servidor" },
        { status: 500 }
      );
    }

    const u = row as AppUserRow | null;
    if (!u || u.pin == null || u.pin !== pin) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const role = String(u.role ?? "").trim() || "user";
    const cookieValue = serializeCopilotSessionValue(u.id, role);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COPILOT_SESSION_COOKIE, cookieValue, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
