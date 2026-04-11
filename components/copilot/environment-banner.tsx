import { Rocket } from "lucide-react";

/** Bloque izquierdo (badge + texto) reutilizable en la franja superior con Salud. */
export function EnvironmentBannerLeft() {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2 font-semibold">
      <Rocket className="h-4 w-4 shrink-0 text-[var(--copilot-accent)]" aria-hidden />
      <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--copilot-accent)]">
        Prototipo
      </span>
      <span className="text-[var(--copilot-ink)]/90">
        Entorno operativo · conectado a datos reales / Supabase
      </span>
    </span>
  );
}

export function EnvironmentBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(31,107,74,0.22)] bg-[var(--copilot-accent-soft)] px-4 py-2.5 text-sm text-[var(--copilot-ink)]"
    >
      <EnvironmentBannerLeft />
    </div>
  );
}
