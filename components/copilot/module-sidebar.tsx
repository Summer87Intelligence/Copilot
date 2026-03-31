"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import type { CopilotNavItem } from "@/components/copilot/copilot-nav-config";

export function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function isNavActiveForBase(pathname: string, href: string, basePath: string) {
  const p = normalizePath(pathname);
  const h = normalizePath(href);
  const home = normalizePath(basePath);
  if (h === home) return p === home;
  return p === h || p.startsWith(`${h}/`);
}

export function CopilotModuleSidebar({
  collapsed,
  onToggleCollapsed,
  groups,
  basePath,
  variant,
  brandTitle,
  brandSubtitle,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  groups: CopilotNavItem[][];
  basePath: string;
  variant: "demo" | "prototype";
  brandTitle: string;
  brandSubtitle: string;
}) {
  const pathname = usePathname();
  const iconWrapClass =
    variant === "demo"
      ? "bg-amber-100/90 text-amber-800 ring-1 ring-amber-300/50"
      : "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]";

  const dividerLineClass =
    variant === "demo" ? "bg-amber-200/90" : "bg-[var(--copilot-border)]";

  const sectionLabelClass =
    variant === "demo" ? "text-amber-800/70" : "text-[var(--copilot-ink-muted)]";

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r transition-[width] duration-200 ease-out ${
        variant === "demo"
          ? "border-amber-200/80 bg-[var(--demo-sidebar)]"
          : "border-[var(--copilot-border)] bg-[var(--copilot-sidebar)]"
      } ${collapsed ? "w-[72px]" : "w-[260px]"}`}
    >
      <div
        className={`flex items-center gap-2 border-b px-3 py-4 ${
          variant === "demo"
            ? "border-amber-200/80 bg-amber-50/50"
            : "border-[var(--copilot-border)] bg-[rgba(255,255,255,0.35)]"
        } ${collapsed ? "justify-center" : ""}`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}
        >
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p
              className={`truncate text-sm font-semibold ${
                variant === "demo" ? "text-amber-950" : "text-[var(--copilot-ink)]"
              }`}
            >
              {brandTitle}
            </p>
            <p
              className={`truncate text-xs ${
                variant === "demo" ? "text-amber-800/85" : "text-[var(--copilot-ink-muted)]"
              }`}
            >
              {brandSubtitle}
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {groups.map((items, groupIndex) => (
          <Fragment key={groupIndex}>
            {groupIndex > 0 ? (
              <div className="my-2 mx-1">
                {!collapsed ? (
                  <>
                    <p
                      className={`px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${sectionLabelClass}`}
                    >
                      Sistema
                    </p>
                    <div className={`h-px ${dividerLineClass}`} />
                  </>
                ) : (
                  <div className={`mx-1 h-px ${dividerLineClass}`} />
                )}
              </div>
            ) : null}
            {items.map((item) => {
              const Icon = item.icon;
              const active = isNavActiveForBase(pathname, item.href, basePath);
              const label = item.shortLabel ?? item.label;
              const activeRing =
                variant === "demo"
                  ? "ring-amber-300/60 bg-white shadow-sm"
                  : "ring-[rgba(44,40,37,0.08)] bg-white shadow-sm";
              const accentActive =
                variant === "demo" ? "text-amber-800" : "text-[var(--copilot-accent)]";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? `text-[var(--copilot-ink)] ring-1 ${activeRing}`
                      : variant === "demo"
                        ? "text-amber-900/70 hover:bg-white/70 hover:text-amber-950"
                        : "text-[var(--copilot-ink-muted)] hover:bg-white/60 hover:text-[var(--copilot-ink)]"
                  } ${collapsed ? "justify-center px-2" : ""}`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${active ? accentActive : ""}`}
                    aria-hidden
                  />
                  {!collapsed ? (
                    <span className="truncate">{label}</span>
                  ) : (
                    <span className="sr-only">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </Fragment>
        ))}
      </nav>

      <div
        className={`border-t p-2 ${
          variant === "demo" ? "border-amber-200/80" : "border-[var(--copilot-border)]"
        }`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            variant === "demo"
              ? "text-amber-900/70 hover:bg-white/80 hover:text-amber-950"
              : "text-[var(--copilot-ink-muted)] hover:bg-white/70 hover:text-[var(--copilot-ink)]"
          }`}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" aria-hidden />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
              <span className="flex-1 text-left">Ocultar menú</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
