"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import type { CopilotNavGroup } from "@/components/copilot/copilot-nav-config";

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

const toggleBtnClass =
  "rounded-lg p-2 text-[var(--copilot-ink-muted)] transition hover:bg-white/70 hover:text-[var(--copilot-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]";

export function CopilotModuleSidebar({
  collapsed,
  onToggleCollapsed,
  groups,
  basePath,
  brandTitle,
  brandSubtitle,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  groups: CopilotNavGroup[];
  basePath: string;
  brandTitle: string;
  brandSubtitle: string;
}) {
  const pathname = usePathname();
  const iconWrapClass =
    "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]";

  const dividerLineClass = "bg-[var(--copilot-border)]";

  const sectionLabelClass = "text-[var(--copilot-ink-muted)]";

  return (
    <aside
      className={`flex h-full min-h-0 shrink-0 flex-col overflow-x-hidden overflow-y-hidden border-r border-[var(--copilot-border)] bg-[var(--copilot-sidebar)] transition-[width] duration-200 ease-out ${
        collapsed ? "w-16" : "w-[260px]"
      }`}
    >
      <div
        className={`flex h-[56px] shrink-0 items-center border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.35)] ${
          collapsed ? "justify-center px-2" : "gap-2 px-3"
        }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}
        >
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--copilot-ink)]">
                {brandTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-expanded={true}
              aria-label="Colapsar menú lateral"
              className={toggleBtnClass}
            >
              <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-1"
        aria-label="Navegación del módulo Copilot"
      >
        {collapsed ? (
          <div className="flex justify-center py-0.5">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-expanded={false}
              aria-label="Expandir menú lateral"
              className={toggleBtnClass}
            >
              <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          </div>
        ) : null}
        {groups.map((group, groupIndex) => (
          <Fragment key={groupIndex}>
            {groupIndex > 0 ? (
              <div className="my-1.5 mx-1">
                {!collapsed ? (
                  <>
                    {group.sectionTitle ? (
                      <p
                        className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${sectionLabelClass}`}
                      >
                        {group.sectionTitle}
                      </p>
                    ) : null}
                    <div className={`h-px ${dividerLineClass}`} />
                  </>
                ) : (
                  <div className={`mx-1 h-px ${dividerLineClass}`} />
                )}
              </div>
            ) : !collapsed && group.sectionTitle ? (
              <p
                className={`px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${sectionLabelClass}`}
              >
                {group.sectionTitle}
              </p>
            ) : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavActiveForBase(pathname, item.href, basePath);
              const label = item.shortLabel ?? item.label;
              const tooltip = item.description
                ? `${item.label} — ${item.description}`
                : item.label;
              const activeRing = "ring-[rgba(44,40,37,0.08)] bg-white shadow-sm";
              const accentActive = "text-[var(--copilot-accent)]";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={tooltip}
                  className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium leading-tight transition-colors ${
                    active
                      ? `text-[var(--copilot-ink)] ring-1 ${activeRing}`
                      : "text-[var(--copilot-ink-muted)] hover:bg-white/60 hover:text-[var(--copilot-ink)]"
                  } ${collapsed ? "min-h-7 justify-center px-0" : item.description ? "min-h-9 py-1.5" : "min-h-7"}`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? accentActive : ""}`}
                    aria-hidden
                  />
                  {!collapsed ? (
                    item.description ? (
                      <span className="min-w-0 flex-1">
                        <span className="block truncate leading-snug">{label}</span>
                        <span className="block truncate text-[10px] font-normal leading-snug text-[var(--copilot-ink-muted)]">
                          {item.description}
                        </span>
                      </span>
                    ) : (
                      <span className="truncate">{label}</span>
                    )
                  ) : (
                    <span className="sr-only">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </Fragment>
        ))}
      </nav>
    </aside>
  );
}
