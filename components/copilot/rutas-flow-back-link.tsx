import Link from "next/link";

export function RutasFlowBackLink() {
  return (
    <div className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.35)] px-6 py-2">
      <Link
        href="/copilot/rutas"
        className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
      >
        ← Qué hacer hoy
      </Link>
    </div>
  );
}
