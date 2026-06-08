"use client";

import { Lock } from "lucide-react";
import Link from "next/link";

import { copilotPageMainClass } from "@/components/copilot/copilot-ui";

export function AccessDeniedCard() {
  return (
    <main className={`${copilotPageMainClass} flex flex-1 items-center justify-center`}>
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-8 py-12 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
          <Lock className="h-6 w-6 text-rose-500" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">
            No tenés acceso a esta sección.
          </p>
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            Pedile a un superadmin que revise tus permisos.
          </p>
        </div>
        <Link
          href="/copilot/hoy"
          className="mt-2 rounded-lg bg-[var(--copilot-accent)] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Volver a Hoy
        </Link>
      </div>
    </main>
  );
}
