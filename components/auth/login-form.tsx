"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

const LOGIN_INPUT_CLASS =
  "copilot-login-input w-full rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2.5 text-sm text-[var(--copilot-ink)] placeholder:text-[var(--copilot-ink-muted)] outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-60";

export function LoginForm() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/copilot/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: user.trim(), pin }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          message?: string;
        } | null;
        if (!res.ok) {
          setError(
            typeof json?.error === "string"
              ? json.error
              : typeof json?.message === "string"
                ? json.message
                : "No se pudo ingresar."
          );
          return;
        }
        if (json?.ok) {
          router.replace("/copilot/hoy");
          router.refresh();
          return;
        }
        setError("No se pudo ingresar.");
      } catch {
        setError("Error de red.");
      } finally {
        setLoading(false);
      }
    },
    [pin, router, user]
  );

  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-6 shadow-[var(--copilot-shadow)]">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="login-user"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]"
          >
            Usuario
          </label>
          <input
            id="login-user"
            name="user"
            type="text"
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            disabled={loading}
            className={LOGIN_INPUT_CLASS}
          />
        </div>

        <div>
          <label
            htmlFor="login-pin"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]"
          >
            PIN
          </label>
          <input
            id="login-pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={loading}
            className={LOGIN_INPUT_CLASS}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
