"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";

type AppUserMe = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string;
};

export function CopilotUserBar() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [loading, setLoading] = useState(true);
  const [appUser, setAppUser] = useState<AppUserMe | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await copilotApiFetch("/api/copilot/me");
      if (cancelled) return;
      if (!res.ok) {
        setAppUser(null);
        setLoading(false);
        return;
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setAppUser(null);
        setLoading(false);
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
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

  if (loading) {
    return (
      <span className="text-xs text-[var(--copilot-ink-muted)]">Cargando...</span>
    );
  }

  if (!appUser) {
    return null;
  }

  return (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
      <div className="min-w-0 max-w-[220px] text-right text-xs sm:max-w-[280px]">
        <p className="truncate font-medium text-[var(--copilot-ink)]">
          {appUser.email}
        </p>
        {appUser.role?.trim() ? (
          <p className="truncate text-[var(--copilot-ink-muted)]">
            Rol: {appUser.role}
          </p>
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
