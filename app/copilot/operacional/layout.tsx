import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isOicEnabled } from "@/lib/operacional/oic-feature-flag";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/copilot/operacional",                label: "Dashboard" },
  { href: "/copilot/operacional/reconciliacion", label: "Reconciliación" },
  { href: "/copilot/operacional/actividad",      label: "Actividad" },
  { href: "/copilot/operacional/snapshots",      label: "Snapshots" },
  { href: "/copilot/operacional/pipelines",      label: "Pipelines" },
];

export default function OperacionalLayout({ children }: { children: ReactNode }) {
  if (!isOicEnabled()) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sub-nav */}
      <nav className="flex gap-1 border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.55)] px-6 py-1.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-accent-soft)] hover:text-[var(--copilot-ink)]"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
