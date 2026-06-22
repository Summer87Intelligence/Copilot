"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { CurrencyDisplayToggle } from "@/components/copilot/currency-display-toggle";
import { useTheme } from "@/components/theme/theme-provider";

function getInitials(email: string | null): string {
  if (!email) return "—";
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

  const { theme, setTheme } = useTheme();

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
        <div className="absolute right-0 top-full z-[80] mt-2 w-72 overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] shadow-xl">
          {/* User info */}
          {displayEmail || displayRole ? (
            <div className="flex items-center gap-3 border-b border-[var(--copilot-border)] px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent)] text-base font-bold text-[var(--copilot-on-accent)]">
                {initials}
              </div>
              <div className="min-w-0">
                {displayEmail ? (
                  <p className="truncate text-[13px] font-medium text-[var(--copilot-ink)]">
                    {displayEmail}
                  </p>
                ) : null}
                {displayRole ? (
                  <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                    {capitalizeRole(displayRole)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Vista USD */}
          <div className="border-b border-[var(--copilot-border)] px-4 py-3">
            <CurrencyDisplayToggle />
          </div>

          {/* Tema oscuro */}
          <div className="border-b border-[var(--copilot-border)]">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex min-h-[44px] w-full items-center justify-between px-4 py-2 text-[13px] text-[var(--copilot-ink)] transition hover:bg-[var(--copilot-hover-bg)]"
            >
              <span className="text-[var(--copilot-ink-muted)]">Tema</span>
              <span className="flex items-center gap-1.5 font-medium">
                {theme === "dark" ? (
                  <>
                    <Moon className="h-4 w-4" aria-hidden />
                    Oscuro
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4" aria-hidden />
                    Claro
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Nav items */}
          <div className="py-1">
            <Link
              href="/copilot/configuracion"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-[44px] w-full items-center px-4 py-2 text-[13px] text-[var(--copilot-ink)] transition hover:bg-[var(--copilot-hover-bg)]"
            >
              Configuración
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex min-h-[44px] w-full items-center px-4 py-2 text-left text-[13px] text-[var(--copilot-danger-text)] transition hover:bg-[var(--copilot-hover-bg)]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
