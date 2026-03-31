"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { normalizePath } from "@/components/copilot/module-sidebar";

const LINKS = [
  { href: "/demo/ia", label: "Home IA", match: "exact" as const },
  { href: "/demo/ia/agentes", label: "Agentes", match: "prefix" as const },
  {
    href: "/demo/ia/configuracion",
    label: "Configuración",
    match: "prefix" as const,
  },
  { href: "/demo/ia/prompts", label: "Prompts", match: "prefix" as const },
  { href: "/demo/ia/perfiles", label: "Perfiles", match: "prefix" as const },
  {
    href: "/demo/ia/categorias",
    label: "Categorías",
    match: "prefix" as const,
  },
];

function isActive(pathname: string, href: string, match: "exact" | "prefix") {
  const p = normalizePath(pathname);
  const h = normalizePath(href);
  if (match === "exact") return p === h;
  return p === h || p.startsWith(`${h}/`);
}

export function DemoIaSubnav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-white/90 to-emerald-50/40 px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-900/50">
          Módulo IA
        </span>
        {LINKS.map((item) => {
          const active = isActive(pathname, item.href, item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-amber-100/95 text-amber-950 ring-1 ring-amber-300/70 shadow-sm"
                  : "text-amber-900/65 hover:bg-white/80 hover:text-amber-950"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
