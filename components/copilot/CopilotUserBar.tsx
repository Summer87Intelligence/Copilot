"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { copilotApiFetch } from "@/lib/copilot-fetch";

type AppUserMe = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string;
};

export function CopilotUserBar({
  sessionPreview = null,
}: {
  /** Sesión cookie Copilot: mostrar este perfil sin depender de Supabase ni `/me`. */
  sessionPreview?: CopilotSessionPreview | null;
}) {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [authPending, setAuthPending] = useState(true);
  /** Hay fila de usuario (sesión Supabase o preview desde layout por cookie). */
  const [showUserRow, setShowUserRow] = useState(false);

  const [mePending, setMePending] = useState(false);
  const [appUser, setAppUser] = useState<AppUserMe | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (sessionPreview) {
        setAuthPending(false);
        setShowUserRow(true);
        setMePending(false);
        setAppUser(null);
        return;
      }

      setAuthPending(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (cancelled) return;

      if (authError || !authData.user) {
        setShowUserRow(false);
        setAuthPending(false);
        setMePending(false);
        setAppUser(null);
        return;
      }

      setShowUserRow(true);
      setAuthPending(false);

      setMePending(true);
      const res = await copilotApiFetch("/api/copilot/me");
      if (cancelled) return;

      setMePending(false);
      if (!res.ok) {
        setAppUser(null);
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setAppUser(null);
        return;
      }

      const u =
        json &&
        typeof json === "object" &&
        "appUser" in json &&
        json.appUser &&
        typeof (json as { appUser: unknown }).appUser === "object"
          ? ((json as { appUser: AppUserMe }).appUser as AppUserMe)
          : null;
      if (!cancelled) {
        setAppUser(u);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionPreview, supabase]);

  const displayEmail =
    appUser?.email ?? sessionPreview?.displayEmail ?? null;
  const displayRole =
    appUser?.role?.trim() ?? sessionPreview?.displayRole ?? null;

  const handleSignOut = useCallback(async () => {
    if (sessionPreview) {
      await fetch("/api/copilot/logout", { method: "POST" });
      window.location.href = "/login";
      return;
    }
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [sessionPreview, supabase]);

  if (authPending) {
    return (
      <span className="text-xs text-[var(--copilot-ink-muted)]">Cargando...</span>
    );
  }

  if (!showUserRow) {
    return null;
  }

  return (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
      <div className="min-w-0 max-w-[220px] text-right text-xs sm:max-w-[280px]">
        {mePending && !sessionPreview ? (
          <span className="text-[var(--copilot-ink-muted)]">Cargando perfil…</span>
        ) : displayEmail ? (
          <>
            <p className="truncate font-medium text-[var(--copilot-ink)]">
              {displayEmail}
            </p>
            {displayRole ? (
              <p className="truncate text-[var(--copilot-ink-muted)]">
                Rol: {displayRole}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="shrink-0 rounded-lg border border-[var(--copilot-border)] bg-white/90 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink)] transition hover:bg-white dark:bg-neutral-900/90 dark:hover:bg-neutral-900"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
