"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function HoyDrawer({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-[var(--copilot-z-overlay)] bg-[var(--copilot-overlay-backdrop)] backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-[var(--copilot-z-drawer)] flex w-full max-w-[420px] flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-xl sm:w-[420px]"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.06)]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-[var(--copilot-border)] px-5 py-4">{footer}</div>
        ) : null}
      </aside>
    </>
  );
}
