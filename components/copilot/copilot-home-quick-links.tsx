import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Brain,
  CheckSquare,
  Database,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { CopilotSectionTitle } from "@/components/copilot/copilot-ui";

type QuickItem = {
  path: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  emphasized?: boolean;
};

const COPILOT_QUICK_ITEMS: QuickItem[] = [
  {
    path: "/gestion-ia",
    label: "Gestión IA",
    hint: "Cerebro operativo y Opportunity Engine",
    icon: Brain,
    emphasized: true,
  },
  {
    path: "/alertas",
    label: "Alertas",
    hint: "Riesgos y desvíos priorizados",
    icon: TriangleAlert,
  },
  {
    path: "/acciones",
    label: "Acciones",
    hint: "Qué hacer ahora",
    icon: CheckSquare,
  },
  {
    path: "/finanzas",
    label: "Finanzas",
    hint: "Caja, ingresos y gastos",
    icon: Wallet,
  },
  {
    path: "/agentes",
    label: "Agentes IA",
    hint: "Activar especialistas",
    icon: Bot,
  },
  {
    path: "/datos",
    label: "Datos",
    hint: "Fuentes e integraciones",
    icon: Database,
  },
  {
    path: "/escenarios",
    label: "Escenarios",
    hint: "Comparar lecturas",
    icon: BarChart3,
  },
];

/** Demo: módulo IA unificado en `/demo/ia` (sin duplicar agentes / gestión). */
const DEMO_QUICK_ITEMS: QuickItem[] = [
  {
    path: "/ia",
    label: "Centro IA",
    hint: "Cerebro operativo, agentes y configuración",
    icon: Brain,
    emphasized: true,
  },
  {
    path: "/alertas",
    label: "Alertas",
    hint: "Riesgos y desvíos priorizados",
    icon: TriangleAlert,
  },
  {
    path: "/acciones",
    label: "Acciones",
    hint: "Qué hacer ahora",
    icon: CheckSquare,
  },
  {
    path: "/finanzas",
    label: "Finanzas",
    hint: "Caja, ingresos y gastos",
    icon: Wallet,
  },
  {
    path: "/datos",
    label: "Datos",
    hint: "Fuentes e integraciones",
    icon: Database,
  },
  {
    path: "/escenarios",
    label: "Escenarios",
    hint: "Comparar lecturas",
    icon: BarChart3,
  },
];

export function CopilotHomeQuickLinks({
  basePath = "/copilot",
}: {
  basePath?: "/copilot" | "/demo";
}) {
  const items = basePath === "/demo" ? DEMO_QUICK_ITEMS : COPILOT_QUICK_ITEMS;

  return (
    <section>
      <CopilotSectionTitle
        title="Accesos rápidos"
        subtitle="Navegá el módulo desde acá o usá el menú lateral."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const href = `${basePath}${item.path}`;
          return (
            <Link
              key={href}
              href={href}
              className={`group flex flex-col gap-2 rounded-2xl border p-4 transition ${
                item.emphasized
                  ? "border-[rgba(31,107,74,0.35)] bg-[var(--copilot-accent-soft)]/40 shadow-sm ring-1 ring-[rgba(31,107,74,0.15)] hover:bg-[var(--copilot-accent-soft)]/60"
                  : "border-[var(--copilot-border)] bg-[var(--copilot-card)] hover:border-[rgba(31,107,74,0.22)] hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.12)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] opacity-0 transition group-hover:opacity-100">
                  Ir
                </span>
              </div>
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">{item.label}</p>
              <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                {item.hint}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
