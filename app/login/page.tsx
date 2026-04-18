"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { LoginForm } from "@/components/auth/login-form";

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

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) {
        router.replace("/copilot");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

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
          Te enviamos un enlace mágico a tu correo. No hace falta contraseña.
        </p>

        <LoginForm />

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
