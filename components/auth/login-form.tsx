"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useMemo, useState, type FormEvent } from "react";

export function LoginForm() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setSent(false);
      const trimmed = email.trim();
      if (!trimmed) {
        setError("Ingresá un email válido.");
        return;
      }

      setLoading(true);
      try {
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: {
            emailRedirectTo: origin
              ? `${origin}/auth/confirm?next=${encodeURIComponent("/copilot/rutas")}`
              : undefined,
          },
        });
        if (otpError) {
          setError(otpError.message);
          return;
        }
        setSent(true);
        setEmail("");
      } catch {
        setError("No se pudo enviar el enlace. Probá de nuevo.");
      } finally {
        setLoading(false);
      }
    },
    [email, supabase]
  );

  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-6 shadow-[var(--copilot-shadow)]">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]"
          >
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="tu@empresa.com"
            className="w-full rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)] disabled:opacity-60 dark:bg-neutral-900"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Enviando…" : "Enviar enlace"}
        </button>
      </form>

      {sent ? (
        <p
          className="mt-4 rounded-lg border border-[rgba(31,107,74,0.35)] bg-[var(--copilot-accent-soft)] px-3 py-2.5 text-sm text-[var(--copilot-ink)]"
          role="status"
        >
          Revisá tu email. Abrí el enlace en este mismo navegador para entrar a
          Copilot.
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
