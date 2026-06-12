"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { copilotApiFetch } from "@/lib/copilot-fetch";

function getInitials(email: string | null): string {
  if (!email) return "?";
  return email.charAt(0).toUpperCase();
}

function capitalizeRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

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
      <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--copilot-border)]" />
    );
  }

  if (!showUserRow) {
    return null;
  }

  const initials = mePending && !sessionPreview ? "…" : getInitials(displayEmail);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Menú de usuario"
        aria-expanded={menuOpen}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--copilot-accent)] text-sm font-semibold text-[var(--copilot-on-accent)] shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/40"
      >
        {initials}
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-full z-[80] mt-2 w-56 overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] shadow-xl">
          {displayEmail || displayRole ? (
            <div className="border-b border-[var(--copilot-border)] px-4 py-3">
              {displayEmail ? (
                <p className="truncate text-xs font-medium text-[var(--copilot-ink)]">
                  {displayEmail}
                </p>
              ) : null}
              {displayRole ? (
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {capitalizeRole(displayRole)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="py-1">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="w-full px-4 py-2 text-left text-sm text-[var(--copilot-danger-text)] transition hover:bg-[var(--copilot-hover-bg)]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
