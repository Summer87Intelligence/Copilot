import { FlaskConical, Rocket } from "lucide-react";

export function EnvironmentBanner({
  variant,
}: {
  variant: "demo" | "prototype";
}) {
  if (variant === "demo") {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/90 bg-gradient-to-r from-amber-50 via-orange-50/95 to-amber-50 px-4 py-2.5 text-sm text-amber-950"
      >
        <span className="inline-flex items-center gap-2 font-semibold">
          <FlaskConical className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">
            Demo
          </span>
          <span className="text-amber-900/95">
            Entorno demostración · sin datos reales
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(31,107,74,0.22)] bg-[var(--copilot-accent-soft)] px-4 py-2.5 text-sm text-[var(--copilot-ink)]"
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        <Rocket className="h-4 w-4 shrink-0 text-[var(--copilot-accent)]" aria-hidden />
        <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--copilot-accent)]">
          Prototipo
        </span>
        <span className="text-[var(--copilot-ink)]/90">
          Entorno operativo · conectado a datos reales / Supabase
        </span>
      </span>
    </div>
  );
}
