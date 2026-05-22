"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LoginForm } from "@/components/auth/login-form";

type LoginPhase = "checking" | "redirecting" | "guest";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [phase, setPhase] = useState<LoginPhase>("checking");

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error && process.env.NODE_ENV === "development") {
        console.warn("[login] getUser", error.message);
      }
      if (data.user) {
        if (process.env.NODE_ENV === "development") {
          console.log("[login] sesión activa, redirigiendo a /copilot/hoy", {
            email: data.user.email,
          });
        }
        setPhase("redirecting");
        router.replace("/copilot/hoy");
        return;
      }
      setPhase("guest");
    });
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const showForm = phase === "guest";

  return (
    <main className="min-h-screen bg-[var(--copilot-canvas)] px-4 py-10 text-[var(--copilot-ink)] antialiased">
      <div className="mx-auto max-w-md">
        <p className="mb-6 text-sm">
          <Link
            href="/"
            className="text-[var(--copilot-accent)] underline-offset-2 hover:underline"
          >
            ← Volver al inicio
          </Link>
        </p>

        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          Iniciar sesión · Copilot
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
          Accedé con tu usuario y PIN. Si no tenés credenciales, pedilas a quien
          administra tu espacio de trabajo.
        </p>

        {phase === "checking" || phase === "redirecting" ? (
          <p
            className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-3 py-2.5 text-sm text-[var(--copilot-ink-muted)]"
            role="status"
            aria-live="polite"
          >
            {phase === "redirecting"
              ? "Entrando al Copilot…"
              : "Comprobando…"}
          </p>
        ) : null}

        {showForm ? <LoginForm /> : null}

        <p className="mt-8 text-center text-sm text-[var(--copilot-ink-muted)]">
          <Link
            href="/account"
            className="font-medium text-[var(--copilot-accent)] underline-offset-2 hover:underline"
          >
            Mi cuenta
          </Link>
        </p>
      </div>
    </main>
  );
}
